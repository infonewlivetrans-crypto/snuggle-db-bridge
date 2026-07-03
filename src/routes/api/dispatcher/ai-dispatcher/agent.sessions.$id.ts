import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import {
  getSession, disconnectSession, mockConnectSession, recordHeartbeat, revokeSession,
} from "@/server/ai-dispatcher/agent-session.server";

const ROLES = ["admin", "dispatcher"];

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/agent/sessions/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        const row = await getSession(auth.client, auth.userId, params.id);
        if (!row) return jsonResponse({ error: "not_found" }, { status: 404 });
        return jsonResponse({ row });
      },
      PATCH: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = await request.json().catch(() => ({}));
        const action: string | undefined = body.action;
        if (action === "disconnect") {
          await disconnectSession(auth.client, auth.userId, params.id);
        } else if (action === "mock-connect") {
          await mockConnectSession(auth.client, auth.userId, params.id);
        } else if (action === "heartbeat") {
          await recordHeartbeat(auth.client, auth.userId, params.id, body.patch);
        } else if (action === "revoke") {
          await revokeSession(auth.client, auth.userId, params.id);
        } else {
          return jsonResponse({ error: "unknown_action" }, { status: 400 });
        }
        return jsonResponse({ ok: true });
      },
    },
  },
});
