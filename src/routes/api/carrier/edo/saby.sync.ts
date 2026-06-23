// POST /api/carrier/edo/saby/sync — синхронизация статусов Saby (mock/api_ready).
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import { sabySync } from "@/server/edo/saby-actions.server";

export const Route = createFileRoute("/api/carrier/edo/saby/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        const r = await sabySync(ctx.client, ctx.dispatcherCarrierExtId);
        return jsonResponse(r);
      },
    },
  },
});
