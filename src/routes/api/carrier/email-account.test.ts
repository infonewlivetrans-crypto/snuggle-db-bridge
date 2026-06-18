// POST /api/carrier/email-account/test
// Проверяет IMAP (всегда, если настроен) и SMTP (если is_active и есть пароль).
// Возвращает 200 с ok/false и человекочитаемой ошибкой — никогда не 502.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import { decryptPassword } from "@/server/email/crypto.server";
import { verifySmtp } from "@/server/email/smtp.server";
import { verifyImap } from "@/server/inbound/imap.server";

const TABLE = "dispatcher_carrier_email_accounts" as const;

function friendly(error: string | undefined): string {
  if (!error) return "Неизвестная ошибка";
  const e = error.toLowerCase();
  if (e.includes("enetunreach") || e.includes("eai_again") || e.includes("ehostunreach"))
    return "Не удалось подключиться к почте. Проверьте IMAP-пароль приложения и настройки сервера.";
  if (e.includes("timeout") || e.includes("etimedout"))
    return "Таймаут подключения к почте. Проверьте сервер/порт и доступ.";
  if (e.includes("authenticationfailed") || e.includes("invalid credentials") || e.includes("auth"))
    return "Сервер отклонил пароль. У Mail.ru/Яндекс/Gmail нужен «пароль приложения», а не обычный пароль.";
  if (e.includes("certificate") || e.includes("tls"))
    return "Ошибка TLS-сертификата при подключении к почте.";
  return `Не удалось подключиться: ${error}`;
}

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
        if (error) return jsonResponse({ ok: false, error: friendly(error.message) });
        if (!acc) return jsonResponse({ ok: false, error: "Сначала сохраните настройки почты." });

        const result: {
          ok: boolean;
          imap?: { ok: boolean; error?: string };
          smtp?: { ok: boolean; error?: string; messageId?: string };
          error?: string;
        } = { ok: true };

        // IMAP — главный канал входящих документов.
        if (acc.imap_host && acc.imap_user && acc.imap_password_encrypted) {
          const imap = await verifyImap({
            imap_host: acc.imap_host,
            imap_port: acc.imap_port ?? 993,
            imap_secure: acc.imap_secure ?? true,
            imap_user: acc.imap_user,
            imap_password_encrypted: acc.imap_password_encrypted,
          });
          result.imap = imap.ok ? { ok: true } : { ok: false, error: friendly(imap.error) };
          if (!imap.ok) result.ok = false;
        } else {
          result.imap = { ok: false, error: "IMAP не настроен (хост/логин/пароль)." };
          result.ok = false;
        }

        // SMTP — только если активен и есть пароль (отправка опциональна).
        if (acc.is_active && acc.smtp_password_encrypted) {
          try {
            const pwd = decryptPassword(acc.smtp_password_encrypted);
            const smtp = await verifySmtp({
              email: acc.email,
              from_name: acc.from_name,
              smtp_host: acc.smtp_host,
              smtp_port: acc.smtp_port,
              smtp_secure: acc.smtp_secure,
              smtp_user: acc.smtp_user,
              smtp_password: pwd,
            });
            result.smtp = smtp.ok
              ? { ok: true, messageId: smtp.messageId }
              : { ok: false, error: friendly(smtp.error) };
            // SMTP не блокирует общий ok — отправка опциональна.
          } catch (e) {
            result.smtp = { ok: false, error: friendly(e instanceof Error ? e.message : String(e)) };
          }
        }

        if (!result.ok && !result.error) {
          result.error = result.imap?.error || result.smtp?.error || "Проверка не прошла";
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (ctx.client.from(TABLE as never) as any)
          .update({
            is_verified: result.imap?.ok ?? false,
            last_test_at: new Date().toISOString(),
            last_error: result.ok ? null : (result.error ?? null),
          })
          .eq("id", acc.id);

        // Всегда 200 — UI сам отрисует красное/зелёное.
        return jsonResponse(result);
      },
    },
  },
});
