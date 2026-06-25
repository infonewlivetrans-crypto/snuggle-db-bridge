// API: одно замечание (PATCH / DELETE).
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import { updateRemark, deleteRemark } from "@/server/edo/remarks.server";

export const Route = createFileRoute("/api/carrier/edo/documents/$id/remarks/$remarkId")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await updateRemark(ctx.client, params.id, params.remarkId, body as any);
          return jsonResponse({ ok: true });
        } catch (e) {
          return jsonResponse(
            { error: "save_failed", message: e instanceof Error ? e.message : String(e) },
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
          await deleteRemark(ctx.client, params.id, params.remarkId);
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
