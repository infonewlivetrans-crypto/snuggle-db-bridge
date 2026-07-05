import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import {
  createAgentCommand, listPendingAgentCommands, listRecentAgentCommands,
  type AgentCommandType,
} from "@/server/ai-dispatcher/agent-command.server";

const ROLES = ["admin", "dispatcher"];

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/agent/sessions/$id/commands")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const all = url.searchParams.get("all") === "1";
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || (all ? 30 : 50)));
        const rows = all
          ? await listRecentAgentCommands(auth.client, params.id, limit)
          : await listPendingAgentCommands(auth.client, params.id, limit);
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

