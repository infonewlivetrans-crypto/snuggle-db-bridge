import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, makeAnonClient } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/public/dispatcher-invite/$token/complete")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!params.token || params.token.length < 16 || params.token.length > 256) {
          return jsonResponse({ ok: false, reason: "bad_token" }, { status: 400 });
        }
        let body: unknown = {};
        try {
          body = await request.json();
        } catch {
          /* пустое тело допустимо для водителя/машины */
        }
        const consent = (body ?? {}) as {
          agreed?: boolean;
          agreed_by?: string;
          agreement_text?: string;
          offer_acceptance?: Record<string, unknown>;
        };
        // На сервере дополнительно ограничиваем длину строк перед передачей в SD функцию.
        const sanitized: Record<string, unknown> = {
          agreed: Boolean(consent.agreed),
          agreed_by:
            typeof consent.agreed_by === "string"
              ? consent.agreed_by.trim().slice(0, 255)
              : "",
          agreement_text:
            typeof consent.agreement_text === "string"
              ? consent.agreement_text.slice(0, 2000)
              : "",
        };
        if (consent.offer_acceptance && typeof consent.offer_acceptance === "object") {
          sanitized.offer_acceptance = consent.offer_acceptance;
        }

        const client = makeAnonClient();
        const { data, error } = await client.rpc(
          "dispatcher_invite_complete" as never,
          { p_token: params.token, p_consent: sanitized } as never,
        );
        if (error) return jsonResponse({ ok: false, reason: error.message }, { status: 500 });
        const payload = data as { ok?: boolean; reason?: string } | null;
        if (!payload?.ok) return jsonResponse(payload ?? { ok: false }, { status: 400 });
        return jsonResponse(payload);
      },
    },
  },
});
