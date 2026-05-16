import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/orders/unread-client-messages")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ["admin", "logist", "manager"]);
        if (auth instanceof Response) return auth;

        const url = new URL(request.url);
        const raw = url.searchParams.get("order_ids") ?? "";
        const ids = raw
          .split(",")
          .map((s) => s.trim())
          .filter((s) => /^[0-9a-fA-F-]{36}$/.test(s));

        if (ids.length === 0) return jsonResponse({ items: [] });

        const { data, error } = await auth.client.rpc(
          "get_unread_client_msgs_for_staff",
          { _order_ids: ids },
        );
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ items: data ?? [] });
      },
    },
  },
});
