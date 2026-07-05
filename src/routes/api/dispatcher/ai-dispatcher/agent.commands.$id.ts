import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import {
  ackAgentCommand, completeAgentCommand, failAgentCommand,
  cancelAgentCommand, retryAgentCommand, getAgentCommand,
} from "@/server/ai-dispatcher/agent-command.server";

const ROLES = ["admin", "dispatcher"];

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/agent/commands/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        const row = await getAgentCommand(auth.client, auth.userId, params.id);
        if (!row) return jsonResponse({ error: "not_found" }, { status: 404 });
        return jsonResponse({ row });
      },
      PATCH: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = await request.json().catch(() => ({}));
        const action = body.action as string | undefined;
        if (action === "ack") await ackAgentCommand(auth.client, auth.userId, params.id);
        else if (action === "complete") await completeAgentCommand(auth.client, auth.userId, params.id, body.result);
        else if (action === "fail") await failAgentCommand(auth.client, auth.userId, params.id, body.error ?? "unknown");
        else if (action === "cancel") {
          const r = await cancelAgentCommand(auth.client, auth.userId, params.id);
          if (!r.ok) return jsonResponse({ error: r.reason ?? "cancel_failed" }, { status: 400 });
        } else if (action === "retry") {
          const r = await retryAgentCommand(auth.client, auth.userId, params.id);
          if (!r.ok) return jsonResponse({ error: r.reason ?? "retry_failed" }, { status: 400 });
          return jsonResponse({ ok: true, new_id: r.new_id });
        } else return jsonResponse({ error: "unknown_action" }, { status: 400 });
        return jsonResponse({ ok: true });
      },
    },
  },
});

