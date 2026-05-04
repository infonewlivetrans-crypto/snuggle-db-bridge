import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth, cacheHeaders } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/orders/$id/route-link")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const { data: pt } = await auth.client
          .from("route_points")
          .select("route_id")
          .eq("order_id", params.id)
          .limit(1)
          .maybeSingle();
        const routeId = (pt as { route_id: string } | null)?.route_id ?? null;
        let deliveryRouteId: string | null = null;
        if (routeId) {
          const { data: dr } = await auth.client
            .from("delivery_routes")
            .select("id")
            .eq("source_request_id", routeId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          deliveryRouteId = (dr as { id: string } | null)?.id ?? null;
        }
        return jsonResponse({ routeId, deliveryRouteId }, { headers: cacheHeaders(30) });
      },
    },
  },
});
