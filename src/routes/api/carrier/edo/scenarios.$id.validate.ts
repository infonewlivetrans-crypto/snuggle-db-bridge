// API: валидация сценария ЭПД.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import { validateScenario } from "@/server/edo/scenarios.server";

export const Route = createFileRoute("/api/carrier/edo/scenarios/$id/validate")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        try {
          const r = await validateScenario(ctx.client, ctx.dispatcherCarrierExtId, params.id);
          return jsonResponse(r);
        } catch (e) {
          return jsonResponse({ error: "validation_failed", message: e instanceof Error ? e.message : String(e) }, { status: 500 });
        }
      },
    },
  },
});
