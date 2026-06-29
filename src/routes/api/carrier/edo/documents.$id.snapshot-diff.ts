// GET /api/carrier/edo/documents/$id/snapshot-diff
// Возвращает diff snapshot экспедитора в документе vs текущие данные.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import {
  getDocumentSnapshotDiff, summariseSnapshotDiff, listSnapshotReviews,
} from "@/server/edo/snapshot-diff.server";

export const Route = createFileRoute("/api/carrier/edo/documents/$id/snapshot-diff")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        try {
          const diff = await getDocumentSnapshotDiff(ctx.client, params.id);
          const summary = summariseSnapshotDiff(diff);
          // Carrier видит только shared-отметки (RLS отфильтрует автоматически).
          const reviews = await listSnapshotReviews(ctx.client, params.id, "shared");
          return jsonResponse({ diff, summary, reviews });
        } catch (e) {
          return jsonResponse(
            { error: "diff_failed", message: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
    },
  },
});
