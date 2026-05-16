import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, makeAnonClient } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/public/client-portal/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = (params.token ?? "").trim();
        if (!token || token.length < 16 || token.length > 128) {
          return jsonResponse({ error: "invalid_token" }, { status: 400 });
        }

        const sb = makeAnonClient();
        const { data: clientRows, error: cErr } = await sb.rpc(
          "get_client_by_portal_token",
          { _token: token },
        );
        if (cErr) return jsonResponse({ error: cErr.message }, { status: 500 });
        const client = (clientRows ?? [])[0];
        if (!client) return jsonResponse({ error: "not_found" }, { status: 404 });

        const { data: orders, error: oErr } = await sb.rpc(
          "get_orders_for_portal_token",
          { _token: token },
        );
        if (oErr) return jsonResponse({ error: oErr.message }, { status: 500 });

        return jsonResponse({ client, orders: orders ?? [] });
      },
    },
  },
});
