import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  jsonResponse,
  makeAdminClient,
  requireUser,
  getBearerToken,
} from "@/server/api-helpers.server";

// Публичный endpoint регистрации перевозчика — ШАГ 2 (после signUp на клиенте).
//
// Контракт:
//   • Клиент сначала сам делает supabase.auth.signUp / signInWithPassword.
//   • Затем вызывает этот endpoint с Authorization: Bearer <access_token>.
//   • Endpoint НЕ создаёт auth user (никакого admin.createUser), а только
//     создаёт/привязывает production-карточку carrier к уже существующему
//     auth-пользователю.
//
// Идемпотентность: если profile.user_id уже привязан к carrier — возвращаем ok
// с этим carrier_id и не дублируем записи.

const text = (max: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null ? "" : String(v).trim().slice(0, max)));

const bodySchema = z.object({
  email: z.string().trim().email().max(255),
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
        try {
          // 0) Требуем уже авторизованного пользователя (signUp/signIn делает фронт).
          const token = getBearerToken(request);
          if (!token) {
            return jsonResponse(
              { ok: false, reason: "unauthorized" },
              { status: 401 },
            );
          }
          const auth = await requireUser(token);
          if (!auth) {
            return jsonResponse(
              { ok: false, reason: "unauthorized" },
              { status: 401 },
            );
          }
          const userId = auth.userId;

          let raw: unknown;
          try {
            raw = await request.json();
          } catch {
            return jsonResponse({ ok: false, reason: "invalid_json" }, { status: 400 });
          }
          const parsed = bodySchema.safeParse(raw);
          if (!parsed.success) {
            return jsonResponse(
              { ok: false, reason: "validation_failed", details: parsed.error.issues },
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
            return jsonResponse(
              { ok: false, reason: "agreement_required" },
              { status: 400 },
            );
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

          // Идемпотентность: уже привязан?
          const { data: existingProfile } = await admin
            .from("profiles")
            .select("carrier_id")
            .eq("user_id", userId)
            .maybeSingle();
          const existingCarrierId =
            (existingProfile as { carrier_id?: string | null } | null)?.carrier_id ?? null;
          if (existingCarrierId) {
            return jsonResponse({
              ok: true,
              already_linked: true,
              carrier_id: existingCarrierId,
            });
          }

          // 1) carriers
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
            console.error("[carrier-register] carrier_create_failed", carrierErr);
            return jsonResponse(
              {
                ok: false,
                reason: "carrier_create_failed",
                details: carrierErr?.message ?? null,
              },
              { status: 500 },
            );
          }
          const carrierId = (carrierRow as { id: string }).id;

          // 2) dispatcher_carrier_ext
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
            console.error("[carrier-register] ext_create_failed", extErr);
            return jsonResponse(
              { ok: false, reason: "ext_create_failed", details: extErr.message ?? null },
              { status: 500 },
            );
          }
          const carrierExtId = (extRow as { id: string }).id;

          // 3) profiles.user_id ↔ carrier_id
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

          // 4) роль carrier (если ещё нет)
          await admin
            .from("user_roles")
            .upsert({ user_id: userId, role: "carrier" } as never, {
              onConflict: "user_id,role",
            });

          // 5) водитель (опционально)
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

          // 6) задача диспетчеру
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

          return jsonResponse({ ok: true, email: data.email, carrier_id: carrierId });
        } catch (error) {
          console.error("[carrier-register] unexpected_error", error);
          const message = error instanceof Error ? error.message : String(error);
          return jsonResponse(
            { ok: false, reason: "internal_error", details: message },
            { status: 500 },
          );
        }
      },
    },
  },
});
