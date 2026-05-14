import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/order-active-point")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;

        const url = new URL(request.url);
        const orderId = url.searchParams.get("orderId");
        if (!orderId) return jsonResponse({ error: "orderId обязателен" }, { status: 400 });

        const { data, error } = await auth.client
          .from("route_points")
          .select("id, point_number, route_id, dp_status, client_window_from, client_window_to, dp_planned_arrival_at")
          .eq("order_id", orderId)
          .not("dp_status", "in", "(delivered,not_delivered,returned_to_warehouse)")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(data ?? null);
      },
    },
  },
});
