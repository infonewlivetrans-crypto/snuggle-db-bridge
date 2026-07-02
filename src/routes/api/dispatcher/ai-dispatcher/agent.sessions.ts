import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { listSessions, createSession } from "@/server/ai-dispatcher/agent-session.server";

const ROLES = ["admin", "dispatcher"];

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/agent/sessions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        const rows = await listSessions(auth.client, auth.userId);
        return jsonResponse({ rows });
      },
      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = await request.json().catch(() => ({}));
        const res = await createSession(auth.client, auth.userId, {
          agent_type: body.agent_type,
          agent_name: body.agent_name,
        });
        return jsonResponse(res);
      },
    },
  },
});
