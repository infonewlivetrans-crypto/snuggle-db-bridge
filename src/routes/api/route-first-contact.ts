import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/route-first-contact")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;

        const url = new URL(request.url);
        const routeId = url.searchParams.get("routeId");
        if (!routeId) return jsonResponse({ error: "routeId обязателен" }, { status: 400 });

        const { data: point, error } = await auth.client
          .from("route_points")
          .select("order_id")
          .eq("route_id", routeId)
          .order("point_number", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (!point || !(point as any).order_id) return jsonResponse(null);

        const { data: order, error: orderError } = await auth.client
          .from("orders")
          .select("contact_name, contact_phone")
          .eq("id", (point as any).order_id)
          .maybeSingle();

        if (orderError) return jsonResponse({ error: orderError.message }, { status: 500 });

        return jsonResponse(order ?? null);
      },
    },
  },
});
