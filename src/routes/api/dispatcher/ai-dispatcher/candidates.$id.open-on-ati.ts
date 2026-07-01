import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { openCandidateTab } from "@/server/ai-dispatcher/agent-tabs.server";
import { logAgentEvent } from "@/server/ai-dispatcher/mock-agent.server";

const ROLES = ["admin", "dispatcher"];

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/candidates/$id/open-on-ati")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c: any = auth.client;
        const { data: cand } = await c.from("ai_dispatch_load_candidates")
          .select("id, search_task_id, source_page_url").eq("id", params.id).single();
        if (!cand) return jsonResponse({ error: "not_found" }, { status: 404 });
        await logAgentEvent(auth.client, auth.userId, cand.search_task_id, params.id,
          "candidate_focused", "Диспетчер запросил открытие груза на ATI");
        const tabId = await openCandidateTab(
          auth.client, auth.userId, params.id,
          cand.source_page_url ?? "https://ati.su/loads/",
        );
        return jsonResponse({ ok: true, tab_id: tabId });
      },
    },
  },
});
