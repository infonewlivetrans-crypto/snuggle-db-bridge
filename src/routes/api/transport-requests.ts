import { createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  jsonResponse,
  parseListParams,
  requireAuth,
} from "@/server/api-helpers.server";

const SELECT =
  "id, route_number, request_type, status, request_status, route_date, departure_time, request_priority, warehouse_id, destination_warehouse_id, points_count, total_weight_kg, total_volume_m3, delivery_cost, carrier_cost, carrier_payment_status";

export const Route = createFileRoute("/api/transport-requests")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;

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
        if (error) {
          console.error("[transport-requests] list failed:", error);
          return jsonResponse({ error: error.message }, { status: 500 });
        }
        return jsonResponse(
          { rows: data ?? [], total: count ?? 0 },
          { headers: cacheHeaders(60) },
        );
      },
    },
  },
});
