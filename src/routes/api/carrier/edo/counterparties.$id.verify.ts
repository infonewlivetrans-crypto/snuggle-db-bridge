// API: mock-проверка контрагента ЭДО по ИНН (Этап 2).
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import { verifyCounterparty } from "@/server/edo/carrier-edo.server";

export const Route = createFileRoute("/api/carrier/edo/counterparties/$id/verify")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        try {
          const result = await verifyCounterparty(
            ctx.client, ctx.dispatcherCarrierExtId, params.id,
          );
          return jsonResponse({ result });
        } catch (e) {
          return jsonResponse(
            { error: "verify_failed", message: e instanceof Error ? e.message : String(e) },
            { status: 400 },
          );
        }
      },
    },
  },
});
