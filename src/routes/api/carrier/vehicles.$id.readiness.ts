import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import { vehicleReadinessSchema } from "@/lib/dispatcher/schemas";
import {
  isServiceRoleUnavailable,
  serviceRoleUnavailableResponse,
} from "@/server/admin-errors";

// PATCH /api/carrier/vehicles/:id/readiness
// Перевозчик сообщает готовность своей машины.
// Доступ: carrier/admin. Машина должна принадлежать carrier ctx.
// Не меняет dispatcher_status / dispatcher_work_status / dispatcher_taken_by.

const SELECT =
  "id, dispatcher_carrier_ext_id, current_city, current_lat, current_lng, " +
  "location_updated_at, location_source, ready_to_cities, ready_comment, " +
  "ready_date, ready_from, ready_radius_km, ready_mode, ready_weekdays, " +
  "load_status, free_payload_kg, free_volume_m3, partial_route_from, " +
  "partial_route_to, loading_restrictions";

const ALLOWED_KEYS = [
  "current_city",
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
] as const;

export const Route = createFileRoute("/api/carrier/vehicles/$id/readiness")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["carrier", "admin"]);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id required" }, { status: 400 });

        const ctx = await resolveCarrierCtx(auth.userId);
        if (ctx instanceof Response) return ctx;

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

        // Проверяем принадлежность машины carrier ctx
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existing = await (ctx.admin.from("dispatcher_vehicle_ext" as never) as any)
          .select("id, dispatcher_carrier_ext_id")
          .eq("id", params.id)
          .maybeSingle();
        if (existing.error) {
          return jsonResponse({ error: existing.error.message }, { status: 500 });
        }
        if (!existing.data) {
          return jsonResponse({ error: "not_found" }, { status: 404 });
        }
        if (existing.data.dispatcher_carrier_ext_id !== ctx.dispatcherCarrierExtId) {
          return jsonResponse({ error: "forbidden" }, { status: 403 });
        }

        const input = parsed.data as Record<string, unknown>;
        const update: Record<string, unknown> = {};
        for (const key of ALLOWED_KEYS) {
          if (key in input) update[key] = input[key];
        }

        // Единая логика смены города: сбрасываем старые координаты,
        // снимаем ручную фиксацию, заново геокодим. Источник — "carrier".
        const { enrichVehicleLocation } = await import("@/server/vehicle-location.server");
        await enrichVehicleLocation(ctx.admin, update, "carrier", { vehicleId: params.id });

        if (!("location_updated_at" in update)) {
          update.location_updated_at = new Date().toISOString();
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (ctx.admin.from("dispatcher_vehicle_ext" as never) as any)
          .update(update as unknown as never)
          .eq("id", params.id)
          .select(SELECT)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true, row: data });
      },
    },
  },
});
