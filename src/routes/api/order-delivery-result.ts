import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/order-delivery-result")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;

        const url = new URL(request.url);
        const orderId = url.searchParams.get("orderId");
        if (!orderId) return jsonResponse({ error: "orderId обязателен" }, { status: 400 });

        const { data: point, error } = await auth.client
          .from("route_points")
          .select("id, route_id, dp_status, dp_amount_received, dp_payment_comment, dp_status_changed_at, dp_status_changed_by")
          .eq("order_id", orderId)
          .in("dp_status", ["delivered", "not_delivered", "returned_to_warehouse"])
          .order("dp_status_changed_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (!point) return jsonResponse(null);

        let route = null;
        if ((point as any).route_id) {
          const { data: routeRow } = await auth.client
            .from("routes")
            .select("id, route_number, driver_name")
            .eq("id", (point as any).route_id)
            .maybeSingle();
          route = routeRow ?? null;
        }

        return jsonResponse({ ...(point as any), route });
      },
    },
  },
});
