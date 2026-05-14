import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/route-points-eta-context")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;

        const url = new URL(request.url);
        const routeId = url.searchParams.get("routeId");
        if (!routeId) return jsonResponse({ error: "routeId обязателен" }, { status: 400 });

        const { data: points, error } = await auth.client
          .from("route_points")
          .select("point_number, dp_status, client_window_from, client_window_to, dp_planned_arrival_at, order_id")
          .eq("route_id", routeId)
          .order("point_number", { ascending: true });

        if (error) return jsonResponse({ error: error.message }, { status: 500 });

        const ids = Array.from(new Set((points ?? []).map((p: any) => p.order_id).filter(Boolean)));
        const ordersMap = new Map<string, { latitude: number | null; longitude: number | null }>();

        if (ids.length) {
          const { data: orders } = await auth.client
            .from("orders")
            .select("id, latitude, longitude")
            .in("id", ids);

          for (const o of orders ?? []) {
            ordersMap.set((o as any).id, {
              latitude: (o as any).latitude ?? null,
              longitude: (o as any).longitude ?? null,
            });
          }
        }

        return jsonResponse(
          (points ?? []).map((p: any) => ({
            point_number: p.point_number,
            dp_status: p.dp_status,
            client_window_from: p.client_window_from,
            client_window_to: p.client_window_to,
            dp_planned_arrival_at: p.dp_planned_arrival_at,
            order: ordersMap.get(p.order_id) ?? null,
          })),
        );
      },
    },
  },
});
