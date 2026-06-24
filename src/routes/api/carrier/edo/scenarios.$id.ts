// API: одна запись сценария — GET / PATCH.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import { getScenario, patchScenario } from "@/server/edo/scenarios.server";

export const Route = createFileRoute("/api/carrier/edo/scenarios/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        try {
          const row = await getScenario(ctx.client, ctx.dispatcherCarrierExtId, params.id);
          if (!row) return jsonResponse({ error: "not_found" }, { status: 404 });
          return jsonResponse({ row });
        } catch (e) {
          return jsonResponse({ error: "load_failed", message: e instanceof Error ? e.message : String(e) }, { status: 500 });
        }
      },
      PATCH: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        try {
          await patchScenario(ctx.client, ctx.dispatcherCarrierExtId, params.id, body);
          return jsonResponse({ ok: true });
        } catch (e) {
          return jsonResponse({ error: "save_failed", message: e instanceof Error ? e.message : String(e) }, { status: 400 });
        }
      },
    },
  },
});
