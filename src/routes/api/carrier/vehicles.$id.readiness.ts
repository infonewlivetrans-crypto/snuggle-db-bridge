// PATCH /api/carrier/vehicles/:id/readiness
// Перевозчик сообщает готовность своей машины.
//
// Производственная схема: НЕ использует service_role.
// Авторизация и запись идут через SECURITY DEFINER RPC:
//   - vehicle_readiness_get(p_vehicle_id)        — чтение whitelisted полей,
//   - vehicle_readiness_update(p_vehicle_id, p_patch) — запись whitelisted полей.
// Принадлежность машины перевозчику проверяется внутри RPC через
// user_owns_vehicle_as_carrier(auth.uid(), p_vehicle_id). Доступ к
// машине чужого перевозчика вернёт 403.
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

export const Route = createFileRoute("/api/carrier/vehicles/$id/readiness")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["carrier", "admin"]);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id required" }, { status: 400 });

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

        // Текущее состояние (через SECURITY DEFINER) — нужно enrich-у и
        // одновременно служит проверкой принадлежности машины перевозчику.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const got = await (auth.client as any).rpc("vehicle_readiness_get", {
          p_vehicle_id: params.id,
        });
        if (got.error) {
          if (got.error.code === "42501") {
            return jsonResponse({ error: "forbidden" }, { status: 403 });
          }
          return jsonResponse({ error: got.error.message }, { status: 500 });
        }
        const existingRow = Array.isArray(got.data) ? got.data[0] ?? null : got.data;
        if (!existingRow) return jsonResponse({ error: "not_found" }, { status: 404 });

        const input = parsed.data as Record<string, unknown>;
        const update: Record<string, unknown> = {};
        for (const key of READINESS_KEYS) if (key in input) update[key] = input[key];

        // Единая логика смены города: сбрасываем старые координаты,
        // снимаем ручную фиксацию, заново геокодим. Источник — "carrier".
        const { enrichVehicleLocation } = await import("@/server/vehicle-location.server");
        await enrichVehicleLocation(auth.client, update, "carrier", {
          vehicleId: params.id,
          existing: {
            current_city: existingRow.current_city ?? null,
            current_lat: existingRow.current_lat ?? null,
            current_lng: existingRow.current_lng ?? null,
            location_source: existingRow.location_source ?? null,
          },
        });

        if (!("location_updated_at" in update)) {
          update.location_updated_at = new Date().toISOString();
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const upd = await (auth.client as any).rpc("vehicle_readiness_update", {
          p_vehicle_id: params.id,
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
