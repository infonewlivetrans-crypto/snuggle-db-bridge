import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, makeAdminClient } from "@/server/api-helpers.server";

// Публичный endpoint общей самостоятельной регистрации перевозчика
// (Этап 9, минимальный первый шаг).
//
// Создаёт:
//   1) Пользователя auth (email + password, email_confirm=true).
//   2) Карточку carriers.
//   3) dispatcher_carrier_ext (комиссия 5% + согласие).
//   4) Связь profiles.user_id ↔ carrier_id.
//   5) Роль user_roles = 'carrier'.
//   6) При выборе "перевозчик и водитель" — drivers + dispatcher_driver_ext.
//   7) Задачу диспетчеру: проверить нового перевозчика.
//
// Endpoint многоразовый. При повторной попытке с тем же email возвращает
// { ok: false, already_registered: true } — фронт показывает ссылку на вход.

const text = (max: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null ? "" : String(v).trim().slice(0, max)));

const bodySchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(200),
  registration_type: z.enum(["carrier_only", "carrier_with_driver"]),
  company_name: text(255),
  carrier_kind: z.enum(["ip", "ooo", "self_employed", "individual"]),
  inn: text(20),
  ogrn: text(20),
  phone: text(50),
  city: text(100),
  contact_person: text(255),
  commission_payment_method: text(100),
  commission_agreed: z.boolean(),
  commission_agreed_by: text(255),
  driver_full_name: text(255).optional(),
  driver_phone: text(50).optional(),
  website: z.string().max(500).optional(), // honeypot
});

const COMMISSION_TEXT =
  "Я подтверждаю, что за рейсы, найденные диспетчером/сервисом, оплачиваю комиссию 5% после получения оплаты за перевозку.";

// carrier_type enum в БД: self_employed | ip | ooo. Физлицо мапим в self_employed
// (на следующем шаге расширим enum; не делаем миграцию в этой задаче).
function mapCarrierType(kind: z.infer<typeof bodySchema>["carrier_kind"]):
  | "ip"
  | "ooo"
  | "self_employed" {
  if (kind === "ip") return "ip";
  if (kind === "ooo") return "ooo";
  return "self_employed";
}

export const Route = createFileRoute("/api/public/carrier-register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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

        // Honeypot
        if (data.website && data.website.length > 0) {
          return jsonResponse({ ok: true, spam: true });
        }

        if (!data.company_name) {
          return jsonResponse(
            { ok: false, reason: "company_name_required" },
            { status: 400 },
          );
        }
        if (!data.phone) {
          return jsonResponse({ ok: false, reason: "phone_required" }, { status: 400 });
        }
        if (!data.commission_agreed || !data.commission_agreed_by) {
          return jsonResponse({ ok: false, reason: "agreement_required" }, { status: 400 });
        }
        if (data.registration_type === "carrier_with_driver") {
          if (!data.driver_full_name || !data.driver_phone) {
            return jsonResponse(
              { ok: false, reason: "driver_fields_required" },
              { status: 400 },
            );
          }
        }

        const admin = makeAdminClient();

        // 1) Пользователь.
        const { data: userRes, error: userErr } = await admin.auth.admin.createUser({
          email: data.email,
          password: data.password,
          email_confirm: true,
          user_metadata: {
            full_name: data.contact_person || data.company_name,
            source: "carrier_self_register",
          },
        });
        if (userErr || !userRes?.user) {
          const msg = userErr?.message ?? "";
          if (/already|registered|exists/i.test(msg)) {
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
        const userId = userRes.user.id;

        // 2) carriers
        const { data: carrierRow, error: carrierErr } = await admin
          .from("carriers")
          .insert({
            carrier_type: mapCarrierType(data.carrier_kind),
            company_name: data.company_name,
            inn: data.inn || null,
            ogrn: data.ogrn || null,
            phone: data.phone || null,
            email: data.email,
            city: data.city || null,
            contact_person: data.contact_person || null,
            verification_status: "new",
            source: "carrier_self_register",
          } as never)
          .select("id")
          .single();
        if (carrierErr || !carrierRow) {
          // Откатываем пользователя, чтобы не оставлять зомби.
          await admin.auth.admin.deleteUser(userId).catch(() => undefined);
          return jsonResponse(
            { ok: false, reason: carrierErr?.message ?? "carrier_create_failed" },
            { status: 500 },
          );
        }
        const carrierId = (carrierRow as { id: string }).id;

        // 3) dispatcher_carrier_ext
        const { data: extRow, error: extErr } = await admin
          .from("dispatcher_carrier_ext")
          .insert({
            carrier_id: carrierId,
            name: data.company_name,
            carrier_kind: data.carrier_kind,
            inn: data.inn || null,
            ogrn: data.ogrn || null,
            phone: data.phone || null,
            email: data.email,
            city: data.city || null,
            commission_rate: 0.05,
            commission_agreed: true,
            commission_agreed_at: new Date().toISOString(),
            commission_agreed_by: data.commission_agreed_by,
            commission_agreement_text: COMMISSION_TEXT,
            commission_payment_method: data.commission_payment_method || null,
            verification_status: "new",
          } as never)
          .select("id")
          .single();
        if (extErr) {
          await admin.auth.admin.deleteUser(userId).catch(() => undefined);
          return jsonResponse(
            { ok: false, reason: extErr.message ?? "ext_create_failed" },
            { status: 500 },
          );
        }
        const carrierExtId = (extRow as { id: string }).id;

        // 4) profiles.user_id ↔ carrier_id
        await admin
          .from("profiles")
          .upsert(
            {
              user_id: userId,
              full_name: data.contact_person || data.company_name,
              email: data.email,
              phone: data.phone || null,
              carrier_id: carrierId,
              is_active: true,
            } as never,
            { onConflict: "user_id" },
          );

        // 5) роль carrier
        await admin
          .from("user_roles")
          .insert({ user_id: userId, role: "carrier" } as never);

        // 6) driver — если выбрано "перевозчик и водитель"
        if (data.registration_type === "carrier_with_driver") {
          const { data: driverRow } = await admin
            .from("drivers")
            .insert({
              carrier_id: carrierId,
              full_name: data.driver_full_name!,
              phone: data.driver_phone || null,
              is_active: true,
              source: "carrier_self_register",
            } as never)
            .select("id")
            .single();
          if (driverRow) {
            await admin.from("dispatcher_driver_ext").insert({
              driver_id: (driverRow as { id: string }).id,
              full_name: data.driver_full_name!,
              phone: data.driver_phone || null,
              city: data.city || null,
              dispatcher_carrier_ext_id: carrierExtId,
              dispatcher_status: "new",
              docs_status: "not_uploaded",
            } as never);
          }
        }

        // 7) задача диспетчеру
        await admin.from("dispatcher_tasks").insert({
          task_type: "check_documents",
          title: `Проверить нового перевозчика: ${data.company_name}`,
          description: `Перевозчик зарегистрировался самостоятельно через /carrier/register. Email: ${data.email}. Телефон: ${data.phone}.`,
          priority: "normal",
          task_status: "open",
          related_entity_type: "carrier",
          related_entity_id: carrierId,
          dispatcher_carrier_ext_id: carrierExtId,
        } as never);

        return jsonResponse({ ok: true, email: data.email });
      },
    },
  },
});
