// GET /api/carrier/edo/documents/$id/status — запрос статуса у оператора.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import { refreshCarrierDocStatus } from "@/server/edo/carrier-edo.server";

export const Route = createFileRoute("/api/carrier/edo/documents/$id/status")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        try {
          const r = await refreshCarrierDocStatus(ctx.client, ctx.dispatcherCarrierExtId, params.id);
          return jsonResponse(r, { status: r.ok ? 200 : 400 });
        } catch (e) {
          return jsonResponse(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 400 },
          );
        }
      },
    },
  },
});
