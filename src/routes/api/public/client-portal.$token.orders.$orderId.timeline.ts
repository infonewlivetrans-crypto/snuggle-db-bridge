import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, makeAnonClient } from "@/server/api-helpers.server";

export const Route = createFileRoute(
  "/api/public/client-portal/$token/orders/$orderId/timeline",
)({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = (params.token ?? "").trim();
        const orderId = (params.orderId ?? "").trim();
        if (!token || token.length < 16 || token.length > 128) {
          return jsonResponse({ error: "invalid_token" }, { status: 400 });
        }
        if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
          return jsonResponse({ error: "invalid_order_id" }, { status: 400 });
        }

        const sb = makeAnonClient();
        const { data, error } = await sb.rpc(
          "get_order_timeline_for_portal_token",
          { _token: token, _order_id: orderId },
        );
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ events: data ?? [] });
      },
    },
  },
});
