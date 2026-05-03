import { createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  getBearerToken,
  jsonResponse,
  requireUser,
} from "@/server/api-helpers.server";

/**
 * Статус одного заказа или точки маршрута — точечное обновление UI без
 * перезагрузки всего списка.
 */
export const Route = createFileRoute("/api/order-statuses")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = getBearerToken(request);
        if (!token) return jsonResponse({ error: "unauthorized" }, { status: 401 });
        const auth = await requireUser(token);
        if (!auth) return jsonResponse({ error: "unauthorized" }, { status: 401 });

        const url = new URL(request.url);
        const orderId = url.searchParams.get("order_id");
        const pointId = url.searchParams.get("route_point_id");

        if (pointId) {
          const { data, error } = await auth.client
            .from("route_points")
            .select("id, status, updated_at")
            .eq("id", pointId)
            .maybeSingle();
          if (error) return jsonResponse({ error: error.message }, { status: 500 });
          return jsonResponse({ point: data ?? null }, { headers: cacheHeaders(30) });
        }
        if (orderId) {
          const { data, error } = await auth.client
            .from("orders")
            .select("id, status, updated_at")
            .eq("id", orderId)
            .maybeSingle();
          if (error) return jsonResponse({ error: error.message }, { status: 500 });
          return jsonResponse({ order: data ?? null }, { headers: cacheHeaders(30) });
        }
        return jsonResponse(
          { error: "order_id or route_point_id required" },
          { status: 400 },
        );
      },
    },
  },
});
