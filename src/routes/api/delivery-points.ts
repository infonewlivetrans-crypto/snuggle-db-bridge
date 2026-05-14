import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth, cacheHeaders } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/delivery-points")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;

        const url = new URL(request.url);
        const routeId = url.searchParams.get("routeId");
        if (!routeId) {
          return jsonResponse({ error: "routeId обязателен" }, { status: 400 });
        }

        const { data: points, error: pointsError } = await auth.client
          .from("route_points")
          .select("id, order_id, point_number, status, planned_time, client_window_from, client_window_to")
          .eq("route_id", routeId)
          .order("point_number", { ascending: true });

        if (pointsError) {
          return jsonResponse({ error: pointsError.message }, { status: 500 });
        }

        const orderIds = Array.from(
          new Set((points ?? []).map((p: any) => p.order_id).filter(Boolean)),
        );

        const orderMap = new Map<string, unknown>();

        if (orderIds.length > 0) {
          const { data: orders, error: ordersError } = await auth.client
            .from("orders")
            .select("id, order_number, delivery_address, contact_name, contact_phone, latitude, longitude, map_link, client_works_weekends, comment, driver_comment, driver_comment_is_important")
            .in("id", orderIds);

          if (ordersError) {
            return jsonResponse({ error: ordersError.message }, { status: 500 });
          }

          for (const order of orders ?? []) {
            orderMap.set((order as any).id, order);
          }
        }

        const rows = (points ?? []).map((point: any) => ({
          id: point.id,
          point_number: point.point_number,
          status: point.status,
          planned_time: point.planned_time,
          client_window_from: point.client_window_from,
          client_window_to: point.client_window_to,
          order: orderMap.get(point.order_id) ?? null,
        }));

        return jsonResponse(rows, { headers: cacheHeaders(20) });
      },
    },
  },
});
