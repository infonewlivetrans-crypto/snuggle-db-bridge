import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, makeAdminClient } from "@/server/api-helpers.server";

// POST /api/public/driver-invite/:token/register
// Публичная регистрация водителя по приглашению перевозчика.
// Ссылка многоразовая: статус приглашения не меняется на 'used',
// чтобы водитель мог открыть с другого устройства / повторно.

const text = (max: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null ? "" : String(v).trim().slice(0, max)));

const bodySchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(200),
  full_name: text(255),
  phone: text(50),
  city: text(100),
  license_number: text(50),
  comment: text(1000),
  agreed: z.boolean(),
  website: z.string().max(500).optional(), // honeypot
});

export const Route = createFileRoute("/api/public/driver-invite/$token/register")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const token = params.token;
        if (!token || token.length > 200) {
          return jsonResponse({ ok: false, reason: "invalid_token" }, { status: 400 });
        }
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return jsonResponse({ ok: false, reason: "invalid_json" }, { status: 400 });
        }
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) {
          return jsonResponse(
            { ok: false, reason: "validation_failed", issues: parsed.error.issues },
            { status: 400 },
          );
        }
        const data = parsed.data;
        if (data.website && data.website.length > 0) return jsonResponse({ ok: true, spam: true });
        if (!data.full_name) return jsonResponse({ ok: false, reason: "full_name_required" }, { status: 400 });
        if (!data.phone) return jsonResponse({ ok: false, reason: "phone_required" }, { status: 400 });
        if (!data.agreed) return jsonResponse({ ok: false, reason: "agreement_required" }, { status: 400 });

        const admin = makeAdminClient();

        // 1) Проверяем приглашение
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: invite } = await (admin.from("carrier_invites" as never) as any)
          .select("id, carrier_id, invite_type, status, expires_at")
          .eq("token", token)
          .eq("invite_type", "driver")
          .maybeSingle();
        if (!invite) return jsonResponse({ ok: false, reason: "invite_not_found" }, { status: 404 });
        if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
          return jsonResponse({ ok: false, reason: "expired" }, { status: 410 });
        }
        if (invite.status === "revoked") {
          return jsonResponse({ ok: false, reason: "revoked" }, { status: 410 });
        }
        const carrierId: string = invite.carrier_id;

        // dispatcher_carrier_ext_id для привязки в dispatcher_driver_ext
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: extRow } = await (admin.from("dispatcher_carrier_ext" as never) as any)
          .select("id")
          .eq("carrier_id", carrierId)
          .maybeSingle();
        const dispatcherCarrierExtId: string | null = extRow?.id ?? null;

        // 2) Создаём auth-пользователя или находим существующего
        let userId: string | null = null;
        const { data: createRes, error: createErr } = await admin.auth.admin.createUser({
          email: data.email,
          password: data.password,
          email_confirm: true,
          user_metadata: { full_name: data.full_name, source: "driver_invite_register" },
        });
        if (createErr) {
          const msg = createErr.message ?? "";
          if (/already|registered|exists/i.test(msg)) {
            // Уже есть пользователь — для многоразовой ссылки даём войти с тем же
            // паролем, что он ввёл. Если пароль не совпадает — возвращаем флаг,
            // фронт показывает ссылку на /login.
            return jsonResponse(
              { ok: false, already_registered: true, reason: "already_registered" },
              { status: 409 },
            );
          }
          return jsonResponse(
            { ok: false, reason: msg || "user_create_failed" },
            { status: 500 },
          );
        }
        userId = createRes?.user?.id ?? null;
        if (!userId) {
          return jsonResponse({ ok: false, reason: "user_create_failed" }, { status: 500 });
        }

        // 3) drivers
        const { data: driverRow, error: driverErr } = await admin
          .from("drivers")
          .insert({
            carrier_id: carrierId,
            full_name: data.full_name,
            phone: data.phone || null,
            license_number: data.license_number || null,
            comment: data.comment || null,
            is_active: true,
            source: "driver_invite_register",
            user_id: userId,
          } as never)
          .select("id")
          .single();
        if (driverErr || !driverRow) {
          await admin.auth.admin.deleteUser(userId).catch(() => undefined);
          return jsonResponse(
            { ok: false, reason: driverErr?.message ?? "driver_create_failed" },
            { status: 500 },
          );
        }
        const driverId = (driverRow as { id: string }).id;

        // 4) dispatcher_driver_ext
        if (dispatcherCarrierExtId) {
          await admin.from("dispatcher_driver_ext").insert({
            driver_id: driverId,
            full_name: data.full_name,
            phone: data.phone || null,
            email: data.email,
            city: data.city || null,
            dispatcher_carrier_ext_id: dispatcherCarrierExtId,
            dispatcher_status: "new",
            docs_status: "not_uploaded",
            dispatcher_comment: data.comment || null,
          } as never);
        }

        // 5) profiles
        await admin
          .from("profiles")
          .upsert(
            {
              user_id: userId,
              full_name: data.full_name,
              email: data.email,
              phone: data.phone || null,
              is_active: true,
            } as never,
            { onConflict: "user_id" },
          );

        // 6) роль driver
        await admin.from("user_roles").insert({ user_id: userId, role: "driver" } as never);

        // Намеренно не меняем статус приглашения — ссылка остаётся активной
        // до expires_at. Это и есть многоразовость в рабочем смысле.

        return jsonResponse({ ok: true, email: data.email });
      },
    },
  },
});
