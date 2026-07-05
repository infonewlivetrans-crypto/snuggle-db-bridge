import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

// GET /api/dispatcher/ai-dispatcher/agent/auto-pair/status/:id
// Возвращает только безопасный статус: pending | connected | expired | failed.
export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/agent/auto-pair/status/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c: any = auth.client;
        const { data } = await c
          .from("ai_dispatch_agent_pair_challenges")
          .select("id, status, expires_at, connected_session_id, failure_reason")
          .eq("id", params.id)
          .maybeSingle();
        if (!data) return jsonResponse({ error: "not_found" }, { status: 404 });
        // RLS уже гарантирует, что диспетчер видит только свои challenge.
        return jsonResponse({
          challenge_id: data.id,
          status: data.status,
          expires_at: data.expires_at,
          failure_reason: data.failure_reason,
        });
      },
    },
  },
});
