import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { startSearchOrchestration } from "@/server/ai-dispatcher/search-orchestrator.server";
import { getSimpleAgentErrorMessage } from "@/lib/ai-dispatcher/agent-error-messages";

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/tasks/$id/orchestrator/start")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        try {
          const status = await startSearchOrchestration(auth.client, auth.userId, params.id);
          return jsonResponse({ ok: true, status });
        } catch (e) {
          const code = (e as Error).message || "unknown";
          return jsonResponse({
            ok: false, error_code: code,
            error_message: getSimpleAgentErrorMessage(code, "Не удалось запустить поиск"),
          }, { status: 400 });
        }
      },
    },
  },
});
