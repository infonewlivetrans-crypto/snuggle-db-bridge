// API: создать заготовки документов из сценария.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import { createDocumentsFromScenario } from "@/server/edo/scenarios.server";

export const Route = createFileRoute("/api/carrier/edo/scenarios/$id/create-documents")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        try {
          const r = await createDocumentsFromScenario(ctx.client, ctx.dispatcherCarrierExtId, params.id);
          return jsonResponse(r);
        } catch (e) {
          return jsonResponse({ error: "create_failed", message: e instanceof Error ? e.message : String(e) }, { status: 400 });
        }
      },
    },
  },
});
