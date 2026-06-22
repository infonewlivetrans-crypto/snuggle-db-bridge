// POST /api/carrier/edo/documents/$id/prepare — проверка полей и переход в ready_to_send.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import { prepareCarrierDoc } from "@/server/edo/carrier-edo.server";

export const Route = createFileRoute("/api/carrier/edo/documents/$id/prepare")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        try {
          const r = await prepareCarrierDoc(ctx.client, ctx.dispatcherCarrierExtId, params.id);
          return jsonResponse(r, { status: r.ok ? 200 : 422 });
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
