import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { markCandidateNotActual, resolveAdapterCtx, type AgentAdapterMode } from "@/server/ai-dispatcher/agent-adapter.server";

const ALLOWED = new Set([
  "not_actual", "closed_by_agent", "replaced_by_better",
  "too_cheap", "route_mismatch", "capacity_mismatch",
]);

function resolveMode(request: Request): AgentAdapterMode {
  const url = new URL(request.url); const m = (request.headers.get("x-agent-mode") ?? url.searchParams.get("mode") ?? "mock").toLowerCase();
  if (m === "browser_agent_ready" || m === "browser_agent_live") return m;
  return "mock";
}

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/candidates/$id/mark-not-actual")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = await request.json().catch(() => ({}));
        const reason = ALLOWED.has(body.reason) ? body.reason : "not_actual";
        const ctx = await resolveAdapterCtx(auth.client, auth.userId, resolveMode(request));
        try {
          await markCandidateNotActual(ctx, params.id, reason, body.message);
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 400 });
        }
        return jsonResponse({ ok: true, mode: ctx.mode });
      },
    },
  },
});
