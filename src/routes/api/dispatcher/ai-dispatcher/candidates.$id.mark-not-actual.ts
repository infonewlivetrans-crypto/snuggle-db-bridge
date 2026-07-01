import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { markCandidateNotActual } from "@/server/ai-dispatcher/agent-tabs.server";

const ROLES = ["admin", "dispatcher"];
const ALLOWED = new Set([
  "not_actual", "closed_by_agent", "replaced_by_better",
  "too_cheap", "route_mismatch", "capacity_mismatch",
]);

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/candidates/$id/mark-not-actual")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = await request.json().catch(() => ({}));
        const reason = ALLOWED.has(body.reason) ? body.reason : "not_actual";
        await markCandidateNotActual(auth.client, auth.userId, params.id, reason, body.message);
        return jsonResponse({ ok: true });
      },
    },
  },
});
