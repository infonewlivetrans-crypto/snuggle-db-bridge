import { createFileRoute } from "@tanstack/react-router";
import { cacheHeaders, jsonResponse, requireAuth } from "@/server/api-helpers.server";

// GET /api/order-history?order_id=<uuid>&limit=100
export const Route = createFileRoute("/api/order-history")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const orderId = url.searchParams.get("order_id");
        if (!orderId) return jsonResponse({ error: "order_id required" }, { status: 400 });
        const limit = Math.min(
          Math.max(1, Number(url.searchParams.get("limit")) || 100),
          500,
        );
        const { data, error } = await (
          auth.client.from("order_history" as never) as unknown as {
            select: (s: string) => {
              eq: (c: string, v: string) => {
                order: (c: string, o: { ascending: boolean }) => {
                  limit: (n: number) => Promise<{ data: unknown; error: { message: string } | null }>;
                };
              };
            };
          }
        )
          .select("*")
          .eq("order_id", orderId)
          .order("changed_at", { ascending: false })
          .limit(limit);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(data ?? [], { headers: cacheHeaders(15) });
      },
    },
  },
});
