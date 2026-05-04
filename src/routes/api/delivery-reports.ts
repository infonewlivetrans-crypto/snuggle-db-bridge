import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth, cacheHeaders } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/delivery-reports")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const orderId = url.searchParams.get("order_id");
        if (!orderId) return jsonResponse([], { status: 400, headers: { "X-Error": "order_id required" } });
        const { data, error } = await auth.client
          .from("delivery_reports" as never)
          .select("*")
          .eq("order_id", orderId)
          .order("delivered_at", { ascending: false });
        if (error) return jsonResponse([], { status: 500, headers: { "X-Error": error.message } });
        return jsonResponse(data ?? [], { headers: cacheHeaders(30) });
      },
    },
  },
});
