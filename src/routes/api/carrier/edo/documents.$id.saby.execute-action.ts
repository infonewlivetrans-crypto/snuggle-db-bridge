// POST /api/carrier/edo/documents/$id/saby/execute-action
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import { sabyExecuteAction } from "@/server/edo/saby-actions.server";

export const Route = createFileRoute("/api/carrier/edo/documents/$id/saby/execute-action")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        const body = (await request.json().catch(() => ({}))) as { action?: string };
        const r = await sabyExecuteAction(
          ctx.client, ctx.dispatcherCarrierExtId, params.id, body.action ?? "confirm",
        );
        return jsonResponse(r, { status: r.ok ? 200 : 400 });
      },
    },
  },
});
