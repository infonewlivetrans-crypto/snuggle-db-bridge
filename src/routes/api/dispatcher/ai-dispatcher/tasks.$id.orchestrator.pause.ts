import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { pauseSearchOrchestration } from "@/server/ai-dispatcher/search-orchestrator.server";

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/tasks/$id/orchestrator/pause")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        try {
          const status = await pauseSearchOrchestration(auth.client, auth.userId, params.id);
          return jsonResponse({ ok: true, status });
        } catch (e) {
          return jsonResponse({ ok: false, error_code: (e as Error).message }, { status: 400 });
        }
      },
    },
  },
});
