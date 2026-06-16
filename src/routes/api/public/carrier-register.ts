import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  jsonResponse,
  requireUser,
  getBearerToken,
} from "@/server/api-helpers.server";

// Публичный endpoint регистрации перевозчика — ШАГ 2 (после signUp на клиенте).
//
// Контракт:
//   • Клиент сам делает supabase.auth.signUp / signInWithPassword.
//   • Затем вызывает этот endpoint с Authorization: Bearer <access_token>.
//   • Endpoint работает ТОЛЬКО через user-auth Supabase client.
//   • Все привилегированные операции (создание carriers/ext/profiles/role/...)
//     выполняет SECURITY DEFINER RPC public.carrier_self_register(payload),
//     которая берёт auth.uid() из JWT текущего пользователя.
//
// ВАЖНО: этот endpoint НЕ использует привилегированных клиентов и работает
// только через user-auth Bearer-токен. На VPS service_role key невалиден и
// ломает регистрацию с "Invalid API key" — поэтому здесь его быть не должно.

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
          const userClient = auth.client;

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

          // Всю работу делает SECURITY DEFINER RPC. auth.uid() внутри RPC
          // равен текущему пользователю, чей Bearer-токен пришёл в запрос.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: rpcData, error: rpcErr } = await (userClient.rpc as any)(
            "carrier_self_register",
            { payload: data },
          );

          if (rpcErr) {
            console.error("[carrier-register] rpc_failed", rpcErr);
            const msg = String(rpcErr.message ?? "");
            let reason = "carrier_create_failed";
            let userMessage = "Не удалось создать перевозчика. Обратитесь в поддержку.";
            if (/duplicate key|unique constraint/i.test(msg)) {
              reason = "already_exists";
              userMessage = "Пользователь с такими данными уже зарегистрирован.";
            } else if (/drivers/i.test(msg) && /column|does not exist/i.test(msg)) {
              reason = "driver_create_failed";
              userMessage = "Не удалось создать водителя. Обратитесь в поддержку.";
            } else if (/phone/i.test(msg)) {
              reason = "invalid_phone";
              userMessage = "Проверьте номер телефона.";
            }
            return jsonResponse(
              { ok: false, reason, message: userMessage, details: msg || null },
              { status: 400 },
            );
          }

          const result = (rpcData ?? {}) as {
            ok?: boolean;
            reason?: string;
            carrier_id?: string;
            already_linked?: boolean;
          };

          if (!result.ok) {
            const reason = result.reason ?? "carrier_create_failed";
            const status = reason === "unauthorized" ? 401 : 400;
            return jsonResponse({ ok: false, reason }, { status });
          }

          return jsonResponse({
            ok: true,
            email: data.email,
            carrier_id: result.carrier_id ?? null,
            already_linked: Boolean(result.already_linked),
          });
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
