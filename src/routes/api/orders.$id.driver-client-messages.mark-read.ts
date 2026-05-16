import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/orders/$id/driver-client-messages/mark-read")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "driver"]);
        if (auth instanceof Response) return auth;
        const { data, error } = await auth.client.rpc(
          "mark_order_driver_client_messages_read",
          { _order_id: params.id },
        );
        if (error) {
          const status = /forbidden/i.test(error.message) ? 403 : 500;
          return jsonResponse({ error: error.message }, { status });
        }
        return jsonResponse({ updated: data ?? 0 });
      },
    },
  },
});
