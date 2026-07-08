import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import {
  getSearchOrchestrationStatus,
} from "@/server/ai-dispatcher/search-orchestrator.server";
import { getSimpleAgentErrorMessage } from "@/lib/ai-dispatcher/agent-error-messages";

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/tasks/$id/orchestrator/status")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        try {
          // Read-only: не двигаем цепочку. Атомарный advance выполняется
          // в public callback (agent_advance_orchestration_after_command).
          const status = await getSearchOrchestrationStatus(auth.client, auth.userId, params.id);
          const uiErrorMessage = status.error_code
            ? getSimpleAgentErrorMessage(status.error_code, status.error_message ?? undefined)
            : null;
          return jsonResponse({ ok: true, status: { ...status, error_message: uiErrorMessage } });
        } catch (e) {
          return jsonResponse({ ok: false, error_code: (e as Error).message }, { status: 400 });
        }

      },
    },
  },
});
