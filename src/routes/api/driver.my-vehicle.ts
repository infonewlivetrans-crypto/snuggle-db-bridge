// GET /api/driver/my-vehicle  — driver's currently assigned vehicle + readiness
// PATCH /api/driver/my-vehicle/readiness  — driver updates own readiness
//
// Доступ: role=driver (admin тоже разрешён, для тестирования).
// Водитель видит/обновляет только машину, закреплённую за его драйвер-карточкой.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole, makeAdminClient } from "@/server/api-helpers.server";
import { vehicleReadinessSchema } from "@/lib/dispatcher/schemas";
import {
  isServiceRoleUnavailable,
  serviceRoleUnavailableResponse,
} from "@/server/admin-errors";

const SELECT =
  "id, vehicle_kind, body_type, payload_kg, volume_m3, length_m, width_m, height_m, " +
  "load_methods, home_city, current_city, current_lat, current_lng, " +
  "location_updated_at, location_source, ready_to_cities, ready_comment, " +
  "ready_date, ready_from, ready_radius_km, ready_mode, ready_weekdays, " +
  "load_status, free_payload_kg, free_volume_m3, partial_route_from, " +
  "partial_route_to, loading_restrictions, dispatcher_status, dispatcher_carrier_ext_id, " +
  "dispatcher_driver_ext_id";

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

/**
 * Резолвит закреплённую за пользователем-водителем машину.
 * Возвращает { vehicleId, driverExtId } или null.
 */
async function resolveDriverVehicle(
  userId: string,
): Promise<{ vehicleId: string; driverExtId: string } | null> {
  const admin = makeAdminClient();

  // 1) Найти drivers по user_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const drv = await (admin.from("drivers" as never) as any)
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  const productionDriverId: string | null = drv?.data?.id ?? null;
  if (!productionDriverId) return null;

  // 2) dispatcher_driver_ext по production_driver_id (или driver_id legacy)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ext = await (admin.from("dispatcher_driver_ext" as never) as any)
    .select("id")
    .or(`production_driver_id.eq.${productionDriverId},driver_id.eq.${productionDriverId}`)
    .maybeSingle();
  const driverExtId: string | null = ext?.data?.id ?? null;
  if (!driverExtId) return null;

  // 3) dispatcher_vehicle_ext по dispatcher_driver_ext_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const veh = await (admin.from("dispatcher_vehicle_ext" as never) as any)
    .select("id")
    .eq("dispatcher_driver_ext_id", driverExtId)
    .neq("dispatcher_status", "archive")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const vehicleId: string | null = veh?.data?.id ?? null;
  if (!vehicleId) return null;

  return { vehicleId, driverExtId };
}

export const Route = createFileRoute("/api/driver/my-vehicle")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ["driver", "admin"]);
        if (auth instanceof Response) return auth;

        const link = await resolveDriverVehicle(auth.userId);
        if (!link) return jsonResponse({ row: null });

        const admin = makeAdminClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (admin.from("dispatcher_vehicle_ext" as never) as any)
          .select(SELECT)
          .eq("id", link.vehicleId)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ row: data ?? null });
      },

      PATCH: async ({ request }) => {
        const auth = await requireAnyRole(request, ["driver", "admin"]);
        if (auth instanceof Response) return auth;

        const link = await resolveDriverVehicle(auth.userId);
        if (!link) return jsonResponse({ error: "no_vehicle_assigned" }, { status: 404 });

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

        const input = parsed.data as Record<string, unknown>;
        const update: Record<string, unknown> = {};
        for (const key of ALLOWED_KEYS) if (key in input) update[key] = input[key];

        const admin = makeAdminClient();
        const { enrichVehicleLocation } = await import("@/server/vehicle-location.server");
        await enrichVehicleLocation(admin, update, "driver", { vehicleId: link.vehicleId });

        if (!("location_updated_at" in update)) {
          update.location_updated_at = new Date().toISOString();
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (admin.from("dispatcher_vehicle_ext" as never) as any)
          .update(update as unknown as never)
          .eq("id", link.vehicleId)
          .select(SELECT)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true, row: data });
      },
    },
  },
});
