import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

// POST /api/carrier/offer-acceptance
// Авторизованный carrier/admin записывает акцепт договора-оферты.
// Тело: { dispatcher_carrier_ext_id: string, payload: object, source?: string }
// service_role НЕ используется — вызов идёт через user-auth RLS клиент.

export const Route = createFileRoute("/api/carrier/offer-acceptance")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ["carrier", "admin"]);
        if (auth instanceof Response) return auth;

        let body: {
          dispatcher_carrier_ext_id?: string;
          payload?: Record<string, unknown>;
          source?: string;
        } = {};
        try {
          body = await request.json();
        } catch {
          return jsonResponse(
            { ok: false, reason: "bad_json" },
            { status: 400 },
          );
        }
        const extId = body.dispatcher_carrier_ext_id;
        const payload = body.payload;
        if (!extId || !payload || typeof payload !== "object") {
          return jsonResponse(
            { ok: false, reason: "bad_payload" },
            { status: 400 },
          );
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client as any).rpc(
          "record_carrier_offer_acceptance",
          {
            p_dispatcher_carrier_ext_id: extId,
            p_payload: payload,
            p_source: body.source ?? "carrier_activate",
          },
        );
        if (error) {
          return jsonResponse(
            { ok: false, reason: "rpc_error", error: error.message },
            { status: 400 },
          );
        }
        return jsonResponse({ ok: true, data });
      },
    },
  },
});
