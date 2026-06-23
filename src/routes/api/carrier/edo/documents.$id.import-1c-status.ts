// POST /api/carrier/edo/documents/$id/import-1c-status
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import { importFrom1cStatus } from "@/server/edo/saby-actions.server";

export const Route = createFileRoute("/api/carrier/edo/documents/$id/import-1c-status")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        const body = (await request.json().catch(() => ({}))) as {
          status?: string; external_1c_id?: string | null; error?: string | null;
        };
        const r = await importFrom1cStatus(
          ctx.client, ctx.dispatcherCarrierExtId, params.id, body,
        );
        return jsonResponse(r);
      },
    },
  },
});
