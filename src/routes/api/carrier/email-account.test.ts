// POST /api/carrier/email-account/test — отправить тестовое письмо на свой же ящик.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import { decryptPassword } from "@/server/email/crypto.server";
import { verifySmtp } from "@/server/email/smtp.server";

const TABLE = "dispatcher_carrier_email_accounts" as const;

export const Route = createFileRoute("/api/carrier/email-account/test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: acc, error } = await (ctx.client.from(TABLE as never) as any)
          .select("*")
          .eq("carrier_ext_id", ctx.dispatcherCarrierExtId)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (!acc) return jsonResponse({ error: "no_account" }, { status: 404 });
        if (!acc.smtp_password_encrypted) {
          return jsonResponse({ error: "no_password" }, { status: 400 });
        }

        let password: string;
        try {
          password = decryptPassword(acc.smtp_password_encrypted);
        } catch (e) {
          return jsonResponse(
            { error: "decrypt_failed", detail: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }

        const result = await verifySmtp({
          email: acc.email,
          from_name: acc.from_name,
          smtp_host: acc.smtp_host,
          smtp_port: acc.smtp_port,
          smtp_secure: acc.smtp_secure,
          smtp_user: acc.smtp_user,
          smtp_password: password,
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (ctx.client.from(TABLE as never) as any)
          .update({
            is_verified: result.ok,
            last_test_at: new Date().toISOString(),
            last_error: result.ok ? null : (result.error ?? "Неизвестная ошибка"),
          })
          .eq("id", acc.id);

        return jsonResponse(result, { status: result.ok ? 200 : 502 });
      },
    },
  },
});
