import { createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  jsonResponse,
  requireAuth,
} from "@/server/api-helpers.server";

// GET /api/delivery-routes/$id/completion-report
// Возвращает уведомление route_completed_report для маршрута + сводку по стоимости (routes).
export const Route = createFileRoute(
  "/api/delivery-routes/$id/completion-report",
)({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const sb = auth.client;

        const { data: notifs, error: ne } = await sb
          .from("notifications")
          .select("id, payload, created_at")
          .eq("kind", "route_completed_report")
          .order("created_at", { ascending: false })
          .limit(20);
        if (ne) return jsonResponse({ error: ne.message }, { status: 500 });
        const found =
          (notifs ?? []).find(
            (n) =>
              (n.payload as { delivery_route_id?: string } | null)
                ?.delivery_route_id === params.id,
          ) ?? null;

        const { data: dr } = await sb
          .from("delivery_routes")
          .select("route_id")
          .eq("id", params.id)
          .maybeSingle();
        const routeId = (dr as { route_id?: string } | null)?.route_id;
        let routeCost: {
          delivery_cost: number;
          cost_method: string;
          total_distance_km: number;
          points_count: number;
        } | null = null;
        if (routeId) {
          const { data: r } = await sb
            .from("routes")
            .select(
              "delivery_cost, cost_method, total_distance_km, points_count",
            )
            .eq("id", routeId)
            .maybeSingle();
          routeCost = (r as typeof routeCost) ?? null;
        }

        return jsonResponse(
          { notification: found, routeCost },
          { headers: cacheHeaders(20) },
        );
      },
    },
  },
});
