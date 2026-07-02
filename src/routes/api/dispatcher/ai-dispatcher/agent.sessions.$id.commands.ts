import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import {
  createAgentCommand, listPendingAgentCommands, type AgentCommandType,
} from "@/server/ai-dispatcher/agent-command.server";

const ROLES = ["admin", "dispatcher"];

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/agent/sessions/$id/commands")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        const rows = await listPendingAgentCommands(auth.client, params.id, 50);
        return jsonResponse({ rows });
      },
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = await request.json().catch(() => ({}));
        if (!body.command_type) return jsonResponse({ error: "command_type_required" }, { status: 400 });
        const id = await createAgentCommand(auth.client, auth.userId, {
          sessionId: params.id,
          commandType: body.command_type as AgentCommandType,
          searchTaskId: body.search_task_id ?? null,
          candidateId: body.candidate_id ?? null,
          payload: body.payload ?? {},
        });
        return jsonResponse({ ok: true, id });
      },
    },
  },
});
