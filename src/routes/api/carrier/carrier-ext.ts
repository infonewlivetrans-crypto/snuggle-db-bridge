import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

// PATCH /api/carrier/carrier-ext — обновление расширенных полей перевозчика
// (ATI, реквизиты, налоговый режим, контакты). RLS пропускает только своего
// перевозчика.

const ALLOWED = new Set([
  "name",
  "inn",
  "phone",
  "email",
  "city",
  "whatsapp",
  "telegram",
  "max_messenger",
  "ati_code",
  "ati_email",
  "taxation_type",
  "bank_name",
  "bik",
  "settlement_account",
  "correspondent_account",
  "legal_address",
  "onboarding_step",
  "onboarding_progress",
]);

export const Route = createFileRoute("/api/carrier/carrier-ext")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: extId } = await (auth.client.rpc as any)("carrier_my_ext_id");
        if (!extId) return jsonResponse({ ok: false, error: "no_carrier" }, { status: 404 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client.from("dispatcher_carrier_ext") as any)
          .select(
            "id, name, inn, phone, email, city, whatsapp, telegram, max_messenger, ati_code, ati_email, taxation_type, bank_name, bik, settlement_account, correspondent_account, legal_address, commission_agreed, onboarding_step",
          )
          .eq("id", extId)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true, row: data });
      },
      PATCH: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;

        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return jsonResponse({ error: "invalid_json" }, { status: 400 });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: meExt, error: meErr } = await (auth.client.rpc as any)(
          "carrier_my_ext_id",
        );
        if (meErr || !meExt) {
          return jsonResponse({ error: "no_carrier" }, { status: 403 });
        }
        const extId = meExt as string;

        const patch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(body)) {
          if (ALLOWED.has(k)) patch[k] = v === "" ? null : v;
        }
        if (Object.keys(patch).length === 0) {
          return jsonResponse({ ok: true, updated: 0 });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (auth.client.from("dispatcher_carrier_ext") as any)
          .update(patch)
          .eq("id", extId);
        if (error) {
          console.error("[carrier-ext] update_failed", error.message);
          return jsonResponse(
            { error: "update_failed", detail: error.message },
            { status: 500 },
          );
        }
        return jsonResponse({ ok: true, updated: 1 });
      },
    },
  },
});
