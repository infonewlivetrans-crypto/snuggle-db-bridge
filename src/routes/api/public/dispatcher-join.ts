import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, makeAnonClient } from "@/server/api-helpers.server";

// Публичный endpoint общей регистрации в AI-диспетчере.
// Не использует admin client. Запись идёт через SECURITY DEFINER RPC
// dispatcher_join_submit, доступную anon.

const text = (max: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null ? "" : String(v).trim().slice(0, max)));

const num = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null || v === "") return null;
    const n = typeof v === "string" ? Number(v) : v;
    return Number.isFinite(n) ? n : null;
  });

const carrierSchema = z
  .object({
    name: text(255),
    carrier_kind: z.enum(["ip", "ooo", "self_employed", "individual"]).optional(),
    inn: text(20),
    ogrn: text(20),
    phone: text(50),
    email: text(255),
    city: text(100),
    whatsapp: text(100),
    telegram: text(100),
    max_messenger: text(255),
    bank_name: text(255),
    bank_account: text(50),
    bank_bik: text(20),
    bank_corr_account: text(50),
    payment_method: text(100),
    commission_payment_method: text(100),
  })
  .partial();

const driverSchema = z
  .object({
    full_name: text(255),
    phone: text(50),
    email: text(255),
    whatsapp: text(100),
    telegram: text(100),
    max_messenger: text(255),
    city: text(100),
    dispatcher_comment: text(2000),
  })
  .partial();

const vehicleSchema = z
  .object({
    vehicle_kind: text(100),
    body_type: text(100),
    payload_kg: num,
    volume_m3: num,
    length_m: num,
    width_m: num,
    height_m: num,
    load_methods: z.array(z.string().max(50)).max(20).optional().nullable(),
    home_city: text(100),
    ready_to_cities: z.array(z.string().max(100)).max(50).optional().nullable(),
    ready_date: text(20),
    minimum_trip_rate: num,
    minimum_km_rate: num,
    city_rate: num,
    point_rate: num,
    rate_comment: text(2000),
    dispatcher_comment: text(2000),
  })
  .partial();

const bodySchema = z.object({
  registration_type: z.enum(["carrier", "driver", "driver_with_vehicle", "carrier_full"]),
  carrier: carrierSchema.optional(),
  driver: driverSchema.optional(),
  vehicle: vehicleSchema.optional(),
  agreement: z
    .object({
      agreed: z.boolean().optional(),
      agreed_by: text(255).optional(),
      agreement_text: text(2000).optional(),
    })
    .optional(),
  // Honeypot: обычные люди не заполняют.
  website: z.string().max(500).optional(),
  company_site_extra: z.string().max(500).optional(),
});

export const Route = createFileRoute("/api/public/dispatcher-join")({
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

        // Honeypot: молча возвращаем успех.
        if ((data.website && data.website.length > 0) || (data.company_site_extra && data.company_site_extra.length > 0)) {
          return jsonResponse({ ok: true, spam: true });
        }

        // Минимальные проверки: телефон обязателен для основного субъекта.
        const needsCarrier = data.registration_type === "carrier" || data.registration_type === "carrier_full";
        const needsDriver = data.registration_type === "driver" || data.registration_type === "driver_with_vehicle" || data.registration_type === "carrier_full";

        if (needsCarrier) {
          if (!data.carrier?.name) return jsonResponse({ ok: false, reason: "carrier_name_required" }, { status: 400 });
          if (!data.carrier?.phone) return jsonResponse({ ok: false, reason: "carrier_phone_required" }, { status: 400 });
          if (!data.agreement?.agreed || !data.agreement?.agreed_by) {
            return jsonResponse({ ok: false, reason: "agreement_required" }, { status: 400 });
          }
        }
        if (needsDriver) {
          if (!data.driver?.full_name) return jsonResponse({ ok: false, reason: "driver_name_required" }, { status: 400 });
          if (!data.driver?.phone) return jsonResponse({ ok: false, reason: "driver_phone_required" }, { status: 400 });
        }

        const client = makeAnonClient();
        const { data: result, error } = await client.rpc(
          "dispatcher_join_submit" as never,
          { p_payload: data } as never,
        );
        if (error) {
          return jsonResponse({ ok: false, reason: error.message }, { status: 500 });
        }
        const payload = result as { ok?: boolean; reason?: string } | null;
        if (!payload?.ok) {
          return jsonResponse(payload ?? { ok: false }, { status: 400 });
        }
        return jsonResponse(payload);
      },
    },
  },
});
