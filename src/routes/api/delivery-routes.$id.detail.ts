import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth, cacheHeaders } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/delivery-routes/$id/detail")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const { data, error } = await auth.client
          .from("delivery_routes")
          .select(
            "id, route_number, route_date, status, comment, source_request_id, source_warehouse_id, assigned_driver, assigned_vehicle, source_request:source_request_id(route_number), source_warehouse:source_warehouse_id(name, city)",
          )
          .eq("id", params.id)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (!data) return jsonResponse({ error: "not_found" }, { status: 404 });
        return jsonResponse(data, { headers: cacheHeaders(15) });
      },
    },
  },
});
