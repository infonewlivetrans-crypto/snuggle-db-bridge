import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { vehicleUpdateSchema } from "@/lib/dispatcher/schemas";

const TABLE = "dispatcher_vehicle_ext";
const ALLOWED_ROLES = ["admin", "dispatcher"];

const SELECT =
  "id, vehicle_kind, body_type, payload_kg, volume_m3, length_m, width_m, height_m, " +
  "load_methods, home_city, current_city, current_lat, current_lng, location_updated_at, location_source, " +
  "ready_to_cities, ready_date, ready_comment, ready_radius_km, ready_mode, ready_weekdays, ready_from, " +
  "dispatcher_driver_ext_id, dispatcher_carrier_ext_id, dispatcher_status, " +
  "minimum_trip_rate, minimum_km_rate, city_rate, point_rate, rate_comment, " +
  "dispatcher_comment, production_vehicle_id, created_at, updated_at";

export const Route = createFileRoute("/api/dispatcher/vehicles/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id required" }, { status: 400 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client.from(TABLE as never) as any)
          .select(SELECT)
          .eq("id", params.id)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (!data) return jsonResponse({ error: "not_found" }, { status: 404 });
        return jsonResponse({ row: data });
      },

      PATCH: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id required" }, { status: 400 });
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "invalid JSON" }, { status: 400 });
        }
        const parsed = vehicleUpdateSchema.safeParse(body);
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          const where = first?.path?.join(".") || "?";
          return jsonResponse(
            { error: `validation_failed: ${where} — ${first?.message ?? ""}`, issues: parsed.error.issues },
            { status: 400 },
          );
        }
        const updateBody: Record<string, unknown> = { ...(parsed.data as Record<string, unknown>) };
        const { enrichVehicleLocation } = await import("@/server/vehicle-location.server");
        await enrichVehicleLocation(auth.client, updateBody, "dispatcher", { vehicleId: params.id });
        if (
          !("location_updated_at" in updateBody) &&
          ("current_lat" in updateBody || "current_lng" in updateBody || "current_city" in updateBody)
        ) {
          updateBody.location_updated_at = new Date().toISOString();
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client.from(TABLE as never) as any)
          .update(updateBody as unknown as never)
          .eq("id", params.id)
          .select(SELECT)
          .maybeSingle();
        if (error) {
          const msg = String(error.message ?? "");
          const isCheck = /check constraint|violates check/i.test(msg);
          return jsonResponse(
            { error: isCheck ? `validation_failed: ${msg}` : msg },
            { status: isCheck ? 400 : 500 },
          );
        }
        if (!data) return jsonResponse({ error: "not_found" }, { status: 404 });
        return jsonResponse({ row: data });
      },

      DELETE: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id required" }, { status: 400 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (auth.client.from(TABLE as never) as any)
          .update({ dispatcher_status: "archive" } as unknown as never)
          .eq("id", params.id);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
