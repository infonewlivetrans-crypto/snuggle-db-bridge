import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/request-totals")({
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
          .select("order_id")
          .eq("route_id", routeId);

        if (pointsError) {
          return jsonResponse({ error: pointsError.message }, { status: 500 });
        }

        const orderIds = Array.from(
          new Set((points ?? []).map((p: any) => p.order_id).filter(Boolean)),
        );

        if (orderIds.length === 0) {
          return jsonResponse({
            ordersCount: 0,
            pointsCount: 0,
            totalWeight: 0,
            totalVolume: 0,
            missing: 0,
          });
        }

        const { data: orders, error: ordersError } = await auth.client
          .from("orders")
          .select("id, total_weight_kg, total_volume_m3")
          .in("id", orderIds);

        if (ordersError) {
          return jsonResponse({ error: ordersError.message }, { status: 500 });
        }

        let totalWeight = 0;
        let totalVolume = 0;
        let missing = 0;

        for (const order of orders ?? []) {
          const w = Number((order as any).total_weight_kg ?? 0);
          const v = Number((order as any).total_volume_m3 ?? 0);

          totalWeight += w;
          totalVolume += v;

          if (!(order as any).total_weight_kg || !(order as any).total_volume_m3) {
            missing++;
          }
        }

        return jsonResponse({
          ordersCount: (orders ?? []).length,
          pointsCount: (points ?? []).length,
          totalWeight,
          totalVolume,
          missing,
        });
      },
    },
  },
});
