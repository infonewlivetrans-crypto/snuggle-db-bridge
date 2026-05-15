import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth, cacheHeaders } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/delivery-reports")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const orderId = url.searchParams.get("order_id");
        const routeId = url.searchParams.get("route_id");
        const createdToday = url.searchParams.get("created_today") === "1";
        if (!orderId && !routeId && !createdToday) {
          return jsonResponse([], { status: 400, headers: { "X-Error": "order_id, route_id or created_today required" } });
        }
        let q = auth.client
          .from("delivery_reports" as never)
          .select("*")
          .order("delivered_at", { ascending: false })
          .limit(1000);
        if (orderId) q = q.eq("order_id", orderId);
        if (routeId) q = q.eq("route_id", routeId);
        if (createdToday) {
          const start = new Date();
          start.setHours(0, 0, 0, 0);
          const end = new Date(start);
          end.setDate(end.getDate() + 1);
          q = q.gte("created_at", start.toISOString()).lt("created_at", end.toISOString());
        }
        const { data, error } = await q;
        if (error) return jsonResponse([], { status: 500, headers: { "X-Error": error.message } });
        return jsonResponse(data ?? [], { headers: cacheHeaders(30) });
      },
    },
  },
});
