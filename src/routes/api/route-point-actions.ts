import { createFileRoute } from "@tanstack/react-router";
import { cacheHeaders, jsonResponse, requireAuth } from "@/server/api-helpers.server";

// GET /api/route-point-actions?order_id=|route_point_id=|route_id=
export const Route = createFileRoute("/api/route-point-actions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const orderId = url.searchParams.get("order_id");
        const routePointId = url.searchParams.get("route_point_id");
        const routeId = url.searchParams.get("route_id");
        if (!orderId && !routePointId && !routeId)
          return jsonResponse(
            { error: "order_id | route_point_id | route_id required" },
            { status: 400 },
          );
        const limit = Math.min(
          Math.max(1, Number(url.searchParams.get("limit")) || 200),
          1000,
        );
        const base = (
          auth.client.from("route_point_actions" as never) as unknown as {
            select: (s: string) => {
              eq: (c: string, v: string) => {
                order: (c: string, o: { ascending: boolean }) => {
                  limit: (n: number) => Promise<{ data: unknown; error: { message: string } | null }>;
                };
              };
            };
          }
        ).select("*");
        const filtered = orderId
          ? base.eq("order_id", orderId)
          : routePointId
            ? base.eq("route_point_id", routePointId)
            : base.eq("route_id", routeId!);
        const { data, error } = await filtered
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(data ?? [], { headers: cacheHeaders(10) });
      },
    },
  },
});
