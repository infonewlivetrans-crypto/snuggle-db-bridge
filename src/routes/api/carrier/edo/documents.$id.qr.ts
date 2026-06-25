// API: получить/сгенерировать mock-QR для документа со стороны перевозчика.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import { ensureQrForDocument, getQrForDocument } from "@/server/edo/qr.server";

export const Route = createFileRoute("/api/carrier/edo/documents/$id/qr")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        try {
          const row = await getQrForDocument(ctx.client, params.id);
          return jsonResponse({ row });
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
        const body = (await request.json().catch(() => ({}))) as {
          trip_id?: string | null; driver_id?: string | null;
        };
        try {
          const row = await ensureQrForDocument(
            ctx.client, ctx.dispatcherCarrierExtId, params.id,
            { trip_id: body.trip_id ?? null, driver_id: body.driver_id ?? null },
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
