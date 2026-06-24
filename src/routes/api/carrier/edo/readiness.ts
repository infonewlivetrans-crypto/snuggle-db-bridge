// API: готовность перевозчика к ЭПД.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import { getReadiness, upsertReadiness } from "@/server/edo/epd-readiness.server";

export const Route = createFileRoute("/api/carrier/edo/readiness")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        try {
          const row = await getReadiness(ctx.client, ctx.dispatcherCarrierExtId);
          return jsonResponse({ row });
        } catch (e) {
          return jsonResponse({ error: "load_failed", message: e instanceof Error ? e.message : String(e) }, { status: 500 });
        }
      },
      PATCH: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        try {
          const row = await upsertReadiness(ctx.client, ctx.dispatcherCarrierExtId, body);
          return jsonResponse({ row });
        } catch (e) {
          return jsonResponse({ error: "save_failed", message: e instanceof Error ? e.message : String(e) }, { status: 400 });
        }
      },
    },
  },
});
