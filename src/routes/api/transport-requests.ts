import { createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  getBearerToken,
  jsonResponse,
  parseListParams,
  requireUser,
} from "@/server/api-helpers.server";

/**
 * `routes.destination_warehouse_id` не имеет FK → PostgREST embed
 * `destination:destination_warehouse_id(...)` валится с PGRST200 → 500.
 * Убрали embed, дозаполняем destination вторым запросом по warehouses.
 */
const SELECT =
  "id, route_number, request_type, status, request_status, route_date, departure_time, request_priority, warehouse_id, destination_warehouse_id, points_count, total_weight_kg, total_volume_m3, delivery_cost, carrier_cost, carrier_payment_status, warehouses:warehouse_id(name, address), carrier:carrier_id(company_name), driver:driver_id(full_name, phone), vehicle:vehicle_id(plate_number, brand, model)";

export const Route = createFileRoute("/api/transport-requests")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = getBearerToken(request);
        if (!token) return jsonResponse({ error: "unauthorized" }, { status: 401 });
        const auth = await requireUser(token);
        if (!auth) return jsonResponse({ error: "unauthorized" }, { status: 401 });

        const { limit, offset, search, url } = parseListParams(request);
        const status = url.searchParams.get("status");
        const type = url.searchParams.get("type");

        let q = auth.client
          .from("routes")
          .select(SELECT, { count: "exact" })
          .order("route_date", { ascending: false });

        if (status && status !== "all") q = q.eq("status", status as never);
        if (type && type !== "all") q = q.eq("request_type", type as never);
        if (search) q = q.ilike("route_number", `%${search}%`);

        const { data, error, count } = await q.range(offset, offset + limit - 1);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });

        const rows = ((data ?? []) as unknown) as Array<Record<string, unknown>>;
        const destIds = Array.from(
          new Set(
            rows
              .map((r) => r.destination_warehouse_id)
              .filter((v): v is string => typeof v === "string" && v.length > 0),
          ),
        );
        const destRes =
          destIds.length > 0
            ? await auth.client
                .from("warehouses")
                .select("id, name, address")
                .in("id", destIds)
            : { data: [] as Array<{ id: string; name: string | null; address: string | null }> };
        const destMap = new Map<string, { name: string | null; address: string | null }>();
        for (const w of (destRes.data ?? []) as Array<{ id: string; name: string | null; address: string | null }>) {
          destMap.set(w.id, { name: w.name, address: w.address });
        }
        const enriched = rows.map((r) => ({
          ...r,
          destination:
            typeof r.destination_warehouse_id === "string"
              ? destMap.get(r.destination_warehouse_id) ?? null
              : null,
        }));

        return jsonResponse(
          { rows: enriched, total: count ?? 0 },
          { headers: cacheHeaders(60) },
        );
      },
    },
  },
});
