import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, makeAnonClient } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/public/order-track/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = (params.token ?? "").trim();
        if (!token || token.length < 16 || token.length > 128) {
          return jsonResponse({ error: "invalid_token" }, { status: 400 });
        }
        const client = makeAnonClient();
        const { data, error } = await client.rpc(
          "get_order_by_recipient_token" as never,
          { _token: token } as never,
        );
        if (error) {
          return jsonResponse({ error: "lookup_failed" }, { status: 500 });
        }
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) {
          return jsonResponse({ error: "not_found" }, { status: 404 });
        }
        return jsonResponse({ order: row });
      },
    },
  },
});
