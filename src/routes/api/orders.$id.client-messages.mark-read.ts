import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/orders/$id/client-messages/mark-read")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "logist", "manager"]);
        if (auth instanceof Response) return auth;
        const { data, error } = await auth.client.rpc(
          "mark_order_client_messages_read_by_manager",
          { _order_id: params.id },
        );
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ updated: data ?? 0 });
      },
    },
  },
});
