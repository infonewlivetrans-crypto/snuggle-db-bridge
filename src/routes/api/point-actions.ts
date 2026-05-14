import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/point-actions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;

        const url = new URL(request.url);
        const orderId = url.searchParams.get("orderId");
        const routePointId = url.searchParams.get("routePointId");
        const routeId = url.searchParams.get("routeId");

        let q = auth.client
          .from("route_point_actions")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200);

        if (orderId) q = q.eq("order_id", orderId);
        else if (routePointId) q = q.eq("route_point_id", routePointId);
        else if (routeId) q = q.eq("route_id", routeId);
        else return jsonResponse({ error: "Нужен orderId, routePointId или routeId" }, { status: 400 });

        const { data, error } = await q;
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(data ?? []);
      },
    },
  },
});
