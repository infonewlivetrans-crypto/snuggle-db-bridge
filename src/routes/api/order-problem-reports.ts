import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/order-problem-reports")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;

        const url = new URL(request.url);
        const orderId = url.searchParams.get("orderId");
        if (!orderId) return jsonResponse({ error: "orderId обязателен" }, { status: 400 });

        const { data, error } = await auth.client
          .from("order_problem_reports")
          .select("id, reason, comment, photo_url, urgency, reported_by, manager_name, created_at")
          .eq("order_id", orderId)
          .order("created_at", { ascending: false });

        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(data ?? []);
      },
    },
  },
});
