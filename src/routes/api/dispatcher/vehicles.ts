import { createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  jsonResponse,
  parseListParams,
  requireAnyRole,
} from "@/server/api-helpers.server";
import { vehicleCreateSchema } from "@/lib/dispatcher/schemas";
import { VEHICLE_STATUSES } from "@/lib/dispatcher/statuses";

const TABLE = "dispatcher_vehicle_ext";
const ALLOWED_ROLES = ["admin", "dispatcher"];

const SELECT =
  "id, vehicle_kind, body_type, payload_kg, volume_m3, length_m, width_m, height_m, " +
  "load_methods, home_city, ready_to_cities, ready_date, " +
  "dispatcher_driver_ext_id, dispatcher_carrier_ext_id, dispatcher_status, " +
  "minimum_trip_rate, minimum_km_rate, city_rate, point_rate, rate_comment, " +
  "dispatcher_comment, production_vehicle_id, created_at, updated_at";

const SORT_MAP: Record<string, string> = {
  km_rate: "minimum_km_rate",
  trip_rate: "minimum_trip_rate",
  ready_date: "ready_date",
  city: "home_city",
  status: "dispatcher_status",
};

export const Route = createFileRoute("/api/dispatcher/vehicles")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        const { limit, offset, search, url } = parseListParams(request);
        const status = url.searchParams.get("status");
        const city = url.searchParams.get("city");
        const bodyType = url.searchParams.get("body_type");
        const carrierId = url.searchParams.get("carrier_id");
        const driverId = url.searchParams.get("driver_id");
        const readyToday = url.searchParams.get("ready_today") === "true";
        const sortKey = url.searchParams.get("sort") ?? "";
        const order = url.searchParams.get("order") === "asc";

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = (auth.client.from(TABLE as never) as any)
          .select(SELECT, { count: "exact" });

        if (status && status !== "all" && (VEHICLE_STATUSES as readonly string[]).includes(status)) {
          q = q.eq("dispatcher_status", status);
        }
        if (city) q = q.ilike("home_city", `%${city}%`);
        if (bodyType) q = q.eq("body_type", bodyType);
        if (carrierId) q = q.eq("dispatcher_carrier_ext_id", carrierId);
        if (driverId) q = q.eq("dispatcher_driver_ext_id", driverId);
        if (readyToday) {
          const today = new Date().toISOString().slice(0, 10);
          q = q.lte("ready_date", today).in("dispatcher_status", ["available", "waiting_freight"]);
        }
        if (search) {
          const s = search.replace(/[%,]/g, " ").trim();
          q = q.or(`vehicle_kind.ilike.%${s}%,body_type.ilike.%${s}%,home_city.ilike.%${s}%`);
        }
        const column = SORT_MAP[sortKey] ?? "created_at";
        const ascending = sortKey ? order : false;
        q = q.order(column, { ascending, nullsFirst: false }).range(offset, offset + limit - 1);
        const { data, error, count } = await q;
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(
          { rows: data ?? [], total: count ?? data?.length ?? 0 },
          { headers: cacheHeaders(0) },
        );
      },

      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "invalid JSON" }, { status: 400 });
        }
        const parsed = vehicleCreateSchema.safeParse(body);
        if (!parsed.success) {
          return jsonResponse(
            { error: "validation_failed", issues: parsed.error.issues },
            { status: 400 },
          );
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client.from(TABLE as never) as any)
          .insert(parsed.data as unknown as never)
          .select(SELECT)
          .single();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ row: data }, { status: 201 });
      },
    },
  },
});
