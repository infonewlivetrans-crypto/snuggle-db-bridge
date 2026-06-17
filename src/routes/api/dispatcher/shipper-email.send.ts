// POST /api/dispatcher/shipper-email/send — отправляет письмо грузовладельцу
// с подключённой SMTP-почты перевозчика. Диспетчер/админ. Защита от двойного клика —
// уникальный (created_by, client_request_id) индекс.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { decryptPassword } from "@/server/email/crypto.server";
import { sendEmail } from "@/server/email/smtp.server";

const ALLOWED_ROLES = ["admin", "dispatcher"];

const bodySchema = z.object({
  carrier_ext_id: z.string().uuid(),
  carrier_request_id: z.string().uuid().nullable().optional(),
  freight_id: z.string().uuid().nullable().optional(),
  deal_id: z.string().uuid().nullable().optional(),
  to: z.array(z.string().email()).min(1).max(10),
  cc: z.array(z.string().email()).max(10).optional(),
  subject: z.string().trim().min(1).max(500),
  body: z.string().trim().min(1).max(50_000),
  client_request_id: z.string().trim().min(1).max(120),
});

export const Route = createFileRoute("/api/dispatcher/shipper-email/send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        let raw: unknown;
        try { raw = await request.json(); } catch { return jsonResponse({ error: "invalid_json" }, { status: 400 }); }
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          return jsonResponse(
            { error: `validation_failed: ${first?.path?.join(".") ?? ""} — ${first?.message ?? ""}` },
            { status: 400 },
          );
        }
        const data = parsed.data;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const client = auth.client as any;

        // Идемпотентность: если уже отправляли с этим client_request_id — вернём существующий.
        const dup = await client
          .from("dispatcher_email_messages")
          .select("id, status, error_message, sent_at")
          .eq("created_by", auth.userId)
          .eq("client_request_id", data.client_request_id)
          .maybeSingle();
        if (dup.data) {
          return jsonResponse({ ok: dup.data.status === "sent", duplicate: true, message: dup.data });
        }

        // Получаем SMTP-аккаунт перевозчика
        const accRes = await client
          .from("dispatcher_carrier_email_accounts")
          .select("*")
          .eq("carrier_ext_id", data.carrier_ext_id)
          .maybeSingle();
        if (accRes.error)
          return jsonResponse({ error: accRes.error.message }, { status: 500 });
        const acc = accRes.data;
        if (!acc) return jsonResponse({ error: "no_carrier_email_account" }, { status: 409 });
        if (!acc.is_active) return jsonResponse({ error: "account_inactive" }, { status: 409 });
        if (!acc.smtp_password_encrypted)
          return jsonResponse({ error: "no_password" }, { status: 409 });

        let password: string;
        try {
          password = decryptPassword(acc.smtp_password_encrypted);
        } catch (e) {
          return jsonResponse(
            { error: "decrypt_failed", detail: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }

        const result = await sendEmail({
          account: {
            email: acc.email,
            from_name: acc.from_name,
            smtp_host: acc.smtp_host,
            smtp_port: acc.smtp_port,
            smtp_secure: acc.smtp_secure,
            smtp_user: acc.smtp_user,
            smtp_password: password,
          },
          to: data.to,
          cc: data.cc,
          subject: data.subject,
          text: data.body,
        });

        const status = result.ok ? "sent" : "failed";
        const row: Record<string, unknown> = {
          carrier_ext_id: data.carrier_ext_id,
          carrier_request_id: data.carrier_request_id ?? null,
          freight_id: data.freight_id ?? null,
          deal_id: data.deal_id ?? null,
          from_email: acc.email,
          from_name: acc.from_name,
          to_emails: data.to,
          cc_emails: data.cc ?? [],
          subject: data.subject,
          body: data.body,
          status,
          provider: "carrier_smtp",
          error_message: result.ok ? null : (result.error ?? "Неизвестная ошибка"),
          sent_at: result.ok ? new Date().toISOString() : null,
          client_request_id: data.client_request_id,
          created_by: auth.userId,
        };

        const ins = await client.from("dispatcher_email_messages").insert(row).select("id").maybeSingle();
        if (ins.error) {
          // Гонка с уникальным индексом — вернём dup-результат
          if (ins.error.code === "23505") {
            return jsonResponse({ ok: result.ok, duplicate: true });
          }
          return jsonResponse({ error: ins.error.message }, { status: 500 });
        }

        return jsonResponse(
          { ok: result.ok, id: ins.data?.id, error: result.error },
          { status: result.ok ? 200 : 502 },
        );
      },
    },
  },
});
