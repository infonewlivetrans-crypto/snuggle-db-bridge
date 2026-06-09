import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

// POST /api/carrier/activate/:token
// Авторизованный пользователь (только что зарегистрировавшийся carrier)
// привязывает свою auth.uid() к карточке перевозчика через
// SECURITY DEFINER RPC claim_carrier_account_link.
// service_role здесь НЕ используется — RPC опирается на auth.uid().

export const Route = createFileRoute("/api/carrier/activate/$token")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;

        const token = params.token;
        if (!token) {
          return jsonResponse(
            { ok: false, reason: "no_token", error: "no_token" },
            { status: 400 },
          );
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client as any).rpc(
          "claim_carrier_account_link",
          { _token: token },
        );
        if (error) {
          return jsonResponse(
            { ok: false, reason: "rpc_error", error: error.message },
            { status: 400 },
          );
        }
        return jsonResponse({ ok: true, data });
      },
    },
  },
});
