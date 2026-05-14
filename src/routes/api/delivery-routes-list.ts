import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth, cacheHeaders } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/delivery-routes-list")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;

        const { data: routes, error } = await auth.client
          .from("delivery_routes")
          .select("id, route_number, route_date, status, source_request_id, source_warehouse_id, assigned_driver, assigned_vehicle, created_at")
          .order("route_date", { ascending: false })
          .order("created_at", { ascending: false });

        if (error) {
          return jsonResponse({ error: error.message }, { status: 500 });
        }

        const requestIds = Array.from(
          new Set((routes ?? []).map((r: any) => r.source_request_id).filter(Boolean)),
        );
        const warehouseIds = Array.from(
          new Set((routes ?? []).map((r: any) => r.source_warehouse_id).filter(Boolean)),
        );

        const [requestsRes, warehousesRes] = await Promise.all([
          requestIds.length
            ? auth.client.from("routes").select("id, route_number").in("id", requestIds)
            : Promise.resolve({ data: [], error: null }),
          warehouseIds.length
            ? auth.client.from("warehouses").select("id, name, city").in("id", warehouseIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (requestsRes.error) {
          return jsonResponse({ error: requestsRes.error.message }, { status: 500 });
        }
        if (warehousesRes.error) {
          return jsonResponse({ error: warehousesRes.error.message }, { status: 500 });
        }

        const requestMap = new Map(
          (requestsRes.data ?? []).map((r: any) => [r.id, { route_number: r.route_number }]),
        );
        const warehouseMap = new Map(
          (warehousesRes.data ?? []).map((w: any) => [w.id, { name: w.name, city: w.city }]),
        );

        const rows = (routes ?? []).map((r: any) => ({
          id: r.id,
          route_number: r.route_number,
          route_date: r.route_date,
          status: r.status,
          source_request_id: r.source_request_id,
          source_warehouse_id: r.source_warehouse_id,
          assigned_driver: r.assigned_driver,
          assigned_vehicle: r.assigned_vehicle,
          source_request: requestMap.get(r.source_request_id) ?? null,
          source_warehouse: warehouseMap.get(r.source_warehouse_id) ?? null,
        }));

        return jsonResponse(rows, { headers: cacheHeaders(20) });
      },
    },
  },
});
