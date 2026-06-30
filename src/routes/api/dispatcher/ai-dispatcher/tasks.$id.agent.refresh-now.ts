import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { mockRefreshTask } from "@/server/ai-dispatcher/mock-agent.server";

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/tasks/$id/agent/refresh-now")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        const result = await mockRefreshTask(auth.client, auth.userId, params.id);
        return jsonResponse({ ok: true, ...result });
      },
    },
  },
});
