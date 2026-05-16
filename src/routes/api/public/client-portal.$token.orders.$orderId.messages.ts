import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, makeAnonClient } from "@/server/api-helpers.server";

function badToken(token: string | undefined): boolean {
  return !token || token.length < 16 || token.length > 128;
}

export const Route = createFileRoute(
  "/api/public/client-portal/$token/orders/$orderId/messages",
)({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const token = (params.token ?? "").trim();
        const orderId = (params.orderId ?? "").trim();
        if (badToken(token)) return jsonResponse({ error: "invalid_token" }, { status: 400 });
        if (!/^[0-9a-f-]{36}$/i.test(orderId))
          return jsonResponse({ error: "invalid_order_id" }, { status: 400 });

        const url = new URL(request.url);
        const target = url.searchParams.get("target_role");
        const targetArg = target === "manager" || target === "driver" ? target : null;

        const sb = makeAnonClient();
        const { data, error } = await sb.rpc("list_client_order_messages", {
          _token: token,
          _order_id: orderId,
          _target_role: targetArg,
        });
        if (error) {
          const status = /forbidden/i.test(error.message) ? 403 : 500;
          return jsonResponse({ error: error.message }, { status });
        }
        return jsonResponse({ messages: data ?? [] });
      },

      POST: async ({ request, params }) => {
        const token = (params.token ?? "").trim();
        const orderId = (params.orderId ?? "").trim();
        if (badToken(token)) return jsonResponse({ error: "invalid_token" }, { status: 400 });
        if (!/^[0-9a-f-]{36}$/i.test(orderId))
          return jsonResponse({ error: "invalid_order_id" }, { status: 400 });

        let body: { target_role?: unknown; body?: unknown };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return jsonResponse({ error: "invalid_json" }, { status: 400 });
        }
        const targetRole = body.target_role;
        const text = typeof body.body === "string" ? body.body : "";
        if (targetRole !== "manager" && targetRole !== "driver") {
          return jsonResponse({ error: "invalid_target_role" }, { status: 400 });
        }
        const trimmed = text.trim();
        if (trimmed.length < 1 || trimmed.length > 2000) {
          return jsonResponse({ error: "invalid_body" }, { status: 400 });
        }

        const sb = makeAnonClient();
        const { data, error } = await sb.rpc("post_client_order_message", {
          _token: token,
          _order_id: orderId,
          _target_role: targetRole,
          _body: trimmed,
        });
        if (error) {
          const status = /forbidden/i.test(error.message) ? 403 : 500;
          return jsonResponse({ error: error.message }, { status });
        }
        return jsonResponse({ id: data });
      },
    },
  },
});
