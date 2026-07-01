import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { closeTab } from "@/server/ai-dispatcher/agent-tabs.server";

const ROLES = ["admin", "dispatcher"];

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/candidates/$id/close-page")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = await request.json().catch(() => ({}));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c: any = auth.client;
        const { data: cand } = await c.from("ai_dispatch_load_candidates")
          .select("agent_tab_id").eq("id", params.id).single();
        if (cand?.agent_tab_id) {
          await closeTab(auth.client, auth.userId, cand.agent_tab_id, body.reason ?? "manual");
          await c.from("ai_dispatch_load_candidates").update({ agent_tab_id: null }).eq("id", params.id);
        }
        return jsonResponse({ ok: true });
      },
    },
  },
});
