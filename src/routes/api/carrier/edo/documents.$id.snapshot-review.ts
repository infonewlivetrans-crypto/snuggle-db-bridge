// POST /api/carrier/edo/documents/$id/snapshot-review
// Создаёт shared-отметку ручной проверки snapshot.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import {
  createSnapshotReview, getDocumentSnapshotDiff,
} from "@/server/edo/snapshot-diff.server";

export const Route = createFileRoute("/api/carrier/edo/documents/$id/snapshot-review")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        try {
          const body = (await request.json().catch(() => ({}))) as {
            decision?: string; comment?: string | null;
          };
          if (!body.decision) {
            return jsonResponse({ error: "decision_required" }, { status: 400 });
          }
          const diff = await getDocumentSnapshotDiff(ctx.client, params.id);
          const row = await createSnapshotReview(
            ctx.client, auth.userId, params.id, diff.forwarder_id,
            {
              decision: body.decision as never,
              comment: body.comment ?? null,
              audience: "shared",
              diff_snapshot_json: {
                diff_types: diff.diff_types,
                risk_level: diff.risk_level,
                diffs: diff.diffs,
                snapshot: diff.snapshot,
                current_snapshot: diff.current_snapshot,
              },
            },
          );
          return jsonResponse({ row });
        } catch (e) {
          return jsonResponse(
            { error: "review_failed", message: e instanceof Error ? e.message : String(e) },
            { status: 400 },
          );
        }
      },
    },
  },
});
