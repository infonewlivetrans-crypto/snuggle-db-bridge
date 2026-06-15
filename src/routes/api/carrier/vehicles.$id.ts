import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";

// PATCH  /api/carrier/vehicles/:id  — обновление полей машины перевозчиком.
// DELETE /api/carrier/vehicles/:id  — мягкая архивация (status = 'archive').
// Production: user-client + RLS, без service_role.

const MUTABLE_FIELDS = [
  "vehicle_kind",
  "body_type",
  "payload_kg",
  "volume_m3",
  "length_m",
  "width_m",
  "height_m",
  "load_methods",
  "home_city",
  "ready_date",
  "ready_from",
  "ready_radius_km",
  "ready_mode",
  "ready_weekdays",
  "ready_comment",
  "ready_to_cities",
  "loading_restrictions",
  "dispatcher_comment",
  "dispatcher_driver_ext_id",
  "min_rate",
  "minimum_trip_rate",
  "minimum_km_rate",
  "city_rate",
  "point_rate",
  "rate_comment",
] as const;

const CARRIER_STATUS_WHITELIST = new Set([
  "new",
  "docs_unchecked",
  "available",
  "waiting_freight",
  "on_trip",
  "resting",
  "inactive",
  "archive",
]);

export const Route = createFileRoute("/api/carrier/vehicles/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["carrier", "admin"]);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id_required" }, { status: 400 });
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return jsonResponse({ error: "invalid_json" }, { status: 400 });
        }

        const update: Record<string, unknown> = {};
        for (const k of MUTABLE_FIELDS) if (k in body) update[k] = body[k];
        if (
          typeof body.dispatcher_status === "string" &&
          CARRIER_STATUS_WHITELIST.has(body.dispatcher_status)
        ) {
          update.dispatcher_status = body.dispatcher_status;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existing = await (ctx.admin.from("dispatcher_vehicle_ext" as never) as any)
          .select("current_city,current_lat,current_lng,location_source")
          .eq("id", params.id)
          .maybeSingle();
        if (existing.error) {
          return jsonResponse({ error: existing.error.message }, { status: 500 });
        }
        if (!existing.data) return jsonResponse({ error: "not_found" }, { status: 404 });

        try {
          const { enrichVehicleLocation } = await import("@/server/vehicle-location.server");
          await enrichVehicleLocation(ctx.admin, update, "carrier", {
            vehicleId: params.id,
            existing: existing.data,
          });
        } catch (e) {
          console.warn("[carrier vehicles PATCH] enrich failed:", (e as Error).message);
        }

        if (Object.keys(update).length === 0) {
          return jsonResponse({ ok: true, noop: true });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const upd = await (ctx.admin.from("dispatcher_vehicle_ext" as never) as any)
          .update(update)
          .eq("id", params.id)
          .select("id")
          .single();
        if (upd.error) {
          if (upd.error.code === "42501")
            return jsonResponse({ error: "forbidden" }, { status: 403 });
          return jsonResponse(
            { error: "update_failed", detail: upd.error.message },
            { status: 400 },
          );
        }
        return jsonResponse({ ok: true });
      },

      DELETE: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["carrier", "admin"]);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id_required" }, { status: 400 });
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const upd = await (ctx.admin.from("dispatcher_vehicle_ext" as never) as any)
          .update({ dispatcher_status: "archive" })
          .eq("id", params.id);
        if (upd.error) {
          if (upd.error.code === "42501")
            return jsonResponse({ error: "forbidden" }, { status: 403 });
          return jsonResponse(
            { error: "archive_failed", detail: upd.error.message },
            { status: 400 },
          );
        }
        return jsonResponse({ ok: true });
      },
    },
  },
});
