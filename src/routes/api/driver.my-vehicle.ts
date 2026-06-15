// GET   /api/driver/my-vehicle           — driver's currently assigned vehicle + readiness
// PATCH /api/driver/my-vehicle           — driver updates own readiness
//
// Доступ: role=driver (admin тоже разрешён, для тестирования).
// Производственная схема: НЕ использует service_role.
// Авторизация и запись идут через SECURITY DEFINER RPC
//   - driver_my_vehicle_ext_id(auth.uid()) — резолв закреплённой машины,
//   - vehicle_readiness_get(p_vehicle_id) — чтение whitelisted полей,
//   - vehicle_readiness_update(p_vehicle_id, p_patch) — запись whitelisted полей.
// Геокодирование/сброс координат при смене города — серверный
// enrichVehicleLocation, кэш Яндекса доступен user-клиенту по RLS.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { vehicleReadinessSchema } from "@/lib/dispatcher/schemas";

const READINESS_KEYS = [
  "current_city",
  "current_lat",
  "current_lng",
  "ready_to_cities",
  "ready_comment",
  "ready_date",
  "ready_from",
  "ready_radius_km",
  "ready_mode",
  "ready_weekdays",
  "load_status",
  "free_payload_kg",
  "free_volume_m3",
  "partial_route_from",
  "partial_route_to",
  "loading_restrictions",
  "location_source",
  "location_updated_at",
] as const;

export const Route = createFileRoute("/api/driver/my-vehicle")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ["driver", "admin"]);
        if (auth instanceof Response) return auth;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const myId = await (auth.client as any).rpc("driver_my_vehicle_ext_id", {
          _user_id: auth.userId,
        });
        if (myId.error) return jsonResponse({ error: myId.error.message }, { status: 500 });
        const vehicleId: string | null = myId.data ?? null;
        if (!vehicleId) return jsonResponse({ row: null });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const got = await (auth.client as any).rpc("vehicle_readiness_get", {
          p_vehicle_id: vehicleId,
        });
        if (got.error) return jsonResponse({ error: got.error.message }, { status: 500 });
        const row = Array.isArray(got.data) ? got.data[0] ?? null : got.data;
        return jsonResponse({ row });
      },

      PATCH: async ({ request }) => {
        const auth = await requireAnyRole(request, ["driver", "admin"]);
        if (auth instanceof Response) return auth;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "invalid JSON" }, { status: 400 });
        }
        const parsed = vehicleReadinessSchema.safeParse(body);
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          return jsonResponse(
            { error: `validation_failed: ${first?.path?.join(".")} — ${first?.message ?? ""}` },
            { status: 400 },
          );
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const myId = await (auth.client as any).rpc("driver_my_vehicle_ext_id", {
          _user_id: auth.userId,
        });
        if (myId.error) return jsonResponse({ error: myId.error.message }, { status: 500 });
        const vehicleId: string | null = myId.data ?? null;
        if (!vehicleId) return jsonResponse({ error: "no_vehicle_assigned" }, { status: 404 });

        // Текущее состояние (через SECURITY DEFINER) — нужно enrich-у, чтобы понять,
        // менялся ли current_city и стоит ли ручная фиксация координат.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const got = await (auth.client as any).rpc("vehicle_readiness_get", {
          p_vehicle_id: vehicleId,
        });
        if (got.error) return jsonResponse({ error: got.error.message }, { status: 500 });
        const existingRow = Array.isArray(got.data) ? got.data[0] ?? null : got.data;

        const input = parsed.data as Record<string, unknown>;
        const update: Record<string, unknown> = {};
        for (const key of READINESS_KEYS) if (key in input) update[key] = input[key];

        const { enrichVehicleLocation } = await import("@/server/vehicle-location.server");
        await enrichVehicleLocation(auth.client, update, "driver", {
          vehicleId,
          existing: existingRow
            ? {
                current_city: existingRow.current_city ?? null,
                current_lat: existingRow.current_lat ?? null,
                current_lng: existingRow.current_lng ?? null,
                location_source: existingRow.location_source ?? null,
              }
            : null,
        });

        if (!("location_updated_at" in update)) {
          update.location_updated_at = new Date().toISOString();
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const upd = await (auth.client as any).rpc("vehicle_readiness_update", {
          p_vehicle_id: vehicleId,
          p_patch: update,
        });
        if (upd.error) {
          const code = upd.error.code;
          if (code === "42501") return jsonResponse({ error: "forbidden" }, { status: 403 });
          if (code === "P0002") return jsonResponse({ error: "not_found" }, { status: 404 });
          return jsonResponse({ error: upd.error.message }, { status: 500 });
        }
        return jsonResponse({ ok: true, row: upd.data });
      },
    },
  },
});
