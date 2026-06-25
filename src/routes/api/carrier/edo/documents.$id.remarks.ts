// API: замечания при приёмке груза (Т2) — список и создание.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import { listRemarks, createRemark } from "@/server/edo/remarks.server";

export const Route = createFileRoute("/api/carrier/edo/documents/$id/remarks")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        try {
          const rows = await listRemarks(ctx.client, params.id);
          return jsonResponse({ rows });
        } catch (e) {
          return jsonResponse(
            { error: "load_failed", message: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
      POST: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        try {
          const row = await createRemark(
            ctx.client,
            ctx.dispatcherCarrierExtId,
            params.id,
            auth.userId,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            body as any,
          );
          return jsonResponse({ row });
        } catch (e) {
          return jsonResponse(
            { error: "save_failed", message: e instanceof Error ? e.message : String(e) },
            { status: 400 },
          );
        }
      },
    },
  },
});
