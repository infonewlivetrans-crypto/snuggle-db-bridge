import { createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  getBearerToken,
  jsonResponse,
  parseListParams,
  requireUser,
} from "@/server/api-helpers.server";

const SELECT =
  "id, route_number, request_type, status, route_date, departure_time, request_priority, warehouse_id, destination_warehouse_id, points_count, total_weight_kg, total_volume_m3, warehouses:warehouse_id(name), destination:destination_warehouse_id(name)";

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

        if (status && status !== "all") q = q.eq("status", status);
        if (type && type !== "all") q = q.eq("request_type", type);
        if (search) q = q.ilike("route_number", `%${search}%`);

        const { data, error, count } = await q.range(offset, offset + limit - 1);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(
          { rows: data ?? [], total: count ?? 0 },
          { headers: cacheHeaders(60) },
        );
      },
    },
  },
});
