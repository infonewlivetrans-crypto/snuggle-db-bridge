// POST /api/dispatcher/edo/documents/$id/snapshot-review
// Диспетчер/админ создаёт отметку (можно audience=dispatcher_internal).
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import {
  createSnapshotReview, getDocumentSnapshotDiff, listSnapshotReviews,
} from "@/server/edo/snapshot-diff.server";

export const Route = createFileRoute("/api/dispatcher/edo/documents/$id/snapshot-review")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        try {
          const diff = await getDocumentSnapshotDiff(auth.client, params.id);
          const reviews = await listSnapshotReviews(auth.client, params.id, "all");
          return jsonResponse({ diff, reviews });
        } catch (e) {
          return jsonResponse(
            { error: "load_failed", message: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        try {
          const body = (await request.json().catch(() => ({}))) as {
            decision?: string; comment?: string | null;
            audience?: "shared" | "dispatcher_internal";
          };
          if (!body.decision) {
            return jsonResponse({ error: "decision_required" }, { status: 400 });
          }
          const diff = await getDocumentSnapshotDiff(auth.client, params.id);
          const row = await createSnapshotReview(
            auth.client, auth.userId, params.id, diff.forwarder_id,
            {
              decision: body.decision as never,
              comment: body.comment ?? null,
              audience: body.audience ?? "dispatcher_internal",
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
