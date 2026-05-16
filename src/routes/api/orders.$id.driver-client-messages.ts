import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/orders/$id/driver-client-messages")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "driver"]);
        if (auth instanceof Response) return auth;
        const { data, error } = await auth.client.rpc(
          "list_order_driver_client_messages",
          { _order_id: params.id },
        );
        if (error) {
          const status = /forbidden/i.test(error.message) ? 403 : 500;
          return jsonResponse({ error: error.message }, { status });
        }
        return jsonResponse({ messages: data ?? [] });
      },
    },
  },
});
