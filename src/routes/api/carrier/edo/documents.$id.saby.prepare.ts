// POST /api/carrier/edo/documents/$id/saby/prepare
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import { sabyPrepareDocument } from "@/server/edo/saby-actions.server";

export const Route = createFileRoute("/api/carrier/edo/documents/$id/saby/prepare")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        const r = await sabyPrepareDocument(ctx.client, ctx.dispatcherCarrierExtId, params.id);
        return jsonResponse(r, { status: r.ok ? 200 : 422 });
      },
    },
  },
});
