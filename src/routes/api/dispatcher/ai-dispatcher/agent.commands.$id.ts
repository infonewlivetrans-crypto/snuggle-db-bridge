import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import {
  ackAgentCommand, completeAgentCommand, failAgentCommand,
} from "@/server/ai-dispatcher/agent-command.server";

const ROLES = ["admin", "dispatcher"];

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/agent/commands/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = await request.json().catch(() => ({}));
        const action = body.action as string | undefined;
        if (action === "ack") await ackAgentCommand(auth.client, auth.userId, params.id);
        else if (action === "complete") await completeAgentCommand(auth.client, auth.userId, params.id, body.result);
        else if (action === "fail") await failAgentCommand(auth.client, auth.userId, params.id, body.error ?? "unknown");
        else return jsonResponse({ error: "unknown_action" }, { status: 400 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
