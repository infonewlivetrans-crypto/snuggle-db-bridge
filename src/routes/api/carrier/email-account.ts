// GET/PUT/DELETE SMTP-аккаунта перевозчика.
// Пароль никогда не возвращается клиенту — только флаг has_password.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import { encryptPassword, EmailEncryptionKeyMissing } from "@/server/email/crypto.server";

const bodySchema = z.object({
  email: z.string().trim().email().max(200),
  from_name: z.string().trim().max(200).nullable().optional(),
  smtp_host: z.string().trim().min(2).max(200),
  smtp_port: z.number().int().min(1).max(65535),
  smtp_secure: z.boolean(),
  smtp_user: z.string().trim().min(1).max(200),
  smtp_password: z.string().min(1).max(500).nullable().optional(), // null = не менять
  ati_email: z.string().trim().max(200).nullable().optional(),
  is_active: z.boolean().optional(),
});

const VIEW = "dispatcher_carrier_email_accounts_safe" as const;
const TABLE = "dispatcher_carrier_email_accounts" as const;

export const Route = createFileRoute("/api/carrier/email-account")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (ctx.client.from(VIEW as never) as any)
          .select("*")
          .eq("carrier_ext_id", ctx.dispatcherCarrierExtId)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ row: data ?? null });
      },

      PUT: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;

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
        const body = parsed.data;

        const update: Record<string, unknown> = {
          carrier_ext_id: ctx.dispatcherCarrierExtId,
          email: body.email,
          from_name: body.from_name ?? null,
          smtp_host: body.smtp_host,
          smtp_port: body.smtp_port,
          smtp_secure: body.smtp_secure,
          smtp_user: body.smtp_user,
          ati_email: body.ati_email ?? null,
          is_active: body.is_active ?? true,
          // is_verified сбрасываем при изменении конфигурации
          is_verified: false,
          last_error: null,
        };

        if (body.smtp_password != null && body.smtp_password.length > 0) {
          try {
            update.smtp_password_encrypted = encryptPassword(body.smtp_password);
          } catch (e) {
            if (e instanceof EmailEncryptionKeyMissing) {
              return jsonResponse(
                { error: "encryption_key_missing", detail: e.message },
                { status: 500 },
              );
            }
            throw e;
          }
        }

        // upsert по carrier_ext_id
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tbl = ctx.client.from(TABLE as never) as any;
        const { data: existing } = await tbl
          .select("id, smtp_password_encrypted")
          .eq("carrier_ext_id", ctx.dispatcherCarrierExtId)
          .maybeSingle();

        if (!existing) {
          if (update.smtp_password_encrypted == null) {
            return jsonResponse(
              { error: "password_required", detail: "При первом сохранении укажите SMTP-пароль (пароль приложения)." },
              { status: 400 },
            );
          }
          const { error } = await tbl.insert(update);
          if (error) return jsonResponse({ error: error.message }, { status: 500 });
        } else {
          const { error } = await tbl.update(update).eq("id", existing.id);
          if (error) return jsonResponse({ error: error.message }, { status: 500 });
        }

        // Возвращаем безопасное представление
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: safe } = await (ctx.client.from(VIEW as never) as any)
          .select("*")
          .eq("carrier_ext_id", ctx.dispatcherCarrierExtId)
          .maybeSingle();
        return jsonResponse({ ok: true, row: safe });
      },

      DELETE: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (ctx.client.from(TABLE as never) as any)
          .delete()
          .eq("carrier_ext_id", ctx.dispatcherCarrierExtId);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
