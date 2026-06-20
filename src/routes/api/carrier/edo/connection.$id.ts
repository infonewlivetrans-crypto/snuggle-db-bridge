// Действия над конкретным подключением: set-default, delete, test
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import {
  deleteCarrierConnection,
  loadConnectionConfig,
  setDefaultConnection,
  updateConnectionCheckStatus,
} from "@/server/edo/carrier-edo.server";

export const Route = createFileRoute("/api/carrier/edo/connection/$id")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        const url = new URL(request.url);
        const op = url.searchParams.get("op");
        try {
          if (op === "set-default") {
            await setDefaultConnection(ctx.client, ctx.dispatcherCarrierExtId, params.id);
            return jsonResponse({ ok: true });
          }
          if (op === "test") {
            const conn = await loadConnectionConfig(
              ctx.client, ctx.dispatcherCarrierExtId, params.id,
            );
            if (!conn) return jsonResponse({ error: "not_found" }, { status: 404 });
            const res = await conn.adapter.testConnection(conn.cfg);
            await updateConnectionCheckStatus(ctx.client, conn.id, res);
            return jsonResponse(res, { status: res.ok ? 200 : 400 });
          }
          return jsonResponse({ error: "unknown_op" }, { status: 400 });
        } catch (e) {
          return jsonResponse(
            { error: "op_failed", message: e instanceof Error ? e.message : String(e) },
            { status: 400 },
          );
        }
      },
      DELETE: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        try {
          await deleteCarrierConnection(ctx.client, ctx.dispatcherCarrierExtId, params.id);
          return jsonResponse({ ok: true });
        } catch (e) {
          return jsonResponse(
            { error: "delete_failed", message: e instanceof Error ? e.message : String(e) },
            { status: 400 },
          );
        }
      },
    },
  },
});
