import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import {
  loadConnectionConfig,
  updateConnectionCheckStatus,
} from "@/server/edo/carrier-edo.server";

export const Route = createFileRoute("/api/carrier/edo/connection/test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        const conn = await loadConnectionConfig(ctx.client, ctx.dispatcherCarrierExtId);
        if (!conn) {
          return jsonResponse({ ok: false, error: "Подключение не настроено" }, { status: 400 });
        }
        const res = await conn.adapter.testConnection(conn.cfg);
        await updateConnectionCheckStatus(ctx.client, conn.id, res);
        return jsonResponse(res, { status: res.ok ? 200 : 400 });
      },
    },
  },
});
