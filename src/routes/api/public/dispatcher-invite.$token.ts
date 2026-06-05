import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, makeAnonClient } from "@/server/api-helpers.server";

// Списки разрешённых полей синхронизированы с SQL-функцией dispatcher_invite_save.
const ALLOWED_FIELDS: Record<string, string[]> = {
  carrier: [
    "name",
    "carrier_kind",
    "inn",
    "ogrn",
    "phone",
    "email",
    "city",
    "whatsapp",
    "telegram",
    "max_messenger",
    "bank_name",
    "bank_account",
    "bank_bik",
    "bank_corr_account",
    "payment_method",
    "commission_payment_method",
  ],
  driver: [
    "full_name",
    "phone",
    "email",
    "whatsapp",
    "telegram",
    "max_messenger",
    "city",
    "docs_comment",
  ],
  vehicle: [
    "vehicle_kind",
    "body_type",
    "payload_kg",
    "volume_m3",
    "length_m",
    "width_m",
    "height_m",
    "load_methods",
    "home_city",
    "ready_to_cities",
    "ready_date",
    "minimum_trip_rate",
    "minimum_km_rate",
    "city_rate",
    "point_rate",
    "rate_comment",
    "docs_comment",
  ],
};

export const Route = createFileRoute("/api/public/dispatcher-invite/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!params.token || params.token.length < 16 || params.token.length > 256) {
          return jsonResponse({ ok: false, reason: "bad_token" }, { status: 400 });
        }
        const client = makeAnonClient();
        const { data, error } = await client.rpc(
          "dispatcher_invite_resolve" as never,
          { p_token: params.token } as never,
        );
        if (error) return jsonResponse({ ok: false, reason: error.message }, { status: 500 });
        const payload = data as { ok?: boolean } | null;
        if (!payload?.ok) return jsonResponse(payload ?? { ok: false }, { status: 404 });
        return jsonResponse(payload);
      },

      PATCH: async ({ request, params }) => {
        if (!params.token || params.token.length < 16 || params.token.length > 256) {
          return jsonResponse({ ok: false, reason: "bad_token" }, { status: 400 });
        }
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ ok: false, reason: "invalid_json" }, { status: 400 });
        }
        const b = (body ?? {}) as { entity_type?: string; data?: Record<string, unknown> };
        const entityType = b.entity_type;
        if (!entityType || !ALLOWED_FIELDS[entityType]) {
          return jsonResponse({ ok: false, reason: "bad_entity_type" }, { status: 400 });
        }
        const allow = new Set(ALLOWED_FIELDS[entityType]);
        const data = b.data ?? {};
        // Очищаем входные данные: только разрешённые ключи, длина строк <= 2000.
        const cleaned: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(data)) {
          if (!allow.has(k)) continue;
          if (typeof v === "string" && v.length > 2000) continue;
          if (Array.isArray(v)) {
            const arr = v
              .filter((x) => typeof x === "string" && x.length > 0 && x.length <= 200)
              .slice(0, 50);
            cleaned[k] = arr;
          } else {
            cleaned[k] = v;
          }
        }

        const client = makeAnonClient();
        const { data: resp, error } = await client.rpc(
          "dispatcher_invite_save" as never,
          { p_token: params.token, p_data: cleaned } as never,
        );
        if (error) return jsonResponse({ ok: false, reason: error.message }, { status: 500 });
        const payload = resp as { ok?: boolean; reason?: string } | null;
        if (!payload?.ok) return jsonResponse(payload ?? { ok: false }, { status: 400 });
        return jsonResponse(payload);
      },
    },
  },
});
