import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, makeAnonClient } from "@/server/api-helpers.server";

// GET /api/public/carrier-activate/:token
// Публичная информация о ссылке активации кабинета перевозчика.
// Не требует авторизации, вызывает SECURITY DEFINER RPC get_carrier_account_link.

export const Route = createFileRoute("/api/public/carrier-activate/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = params.token;
        if (!token) return jsonResponse({ ok: false, reason: "no_token" }, { status: 400 });
        const sb = makeAnonClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (sb as any).rpc("get_carrier_account_link", {
          _token: token,
        });
        if (error) {
          return jsonResponse(
            { ok: false, reason: "rpc_error", error: error.message },
            { status: 400 },
          );
        }
        const row = Array.isArray(data) ? data[0] ?? null : data ?? null;
        if (!row) return jsonResponse({ ok: false, reason: "not_found" }, { status: 404 });
        return jsonResponse({ ok: true, link: row });
      },
    },
  },
});
