import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { logAgentEvent } from "@/server/ai-dispatcher/mock-agent.server";

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/candidates/$id/make-main")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c: any = auth.client;
        const { data: cand, error: e1 } = await c
          .from("ai_dispatch_load_candidates")
          .update({ is_main_load: true, status: "main_selected" })
          .eq("id", params.id).select("*").single();
        if (e1) return jsonResponse({ error: e1.message }, { status: 400 });
        await c.from("ai_dispatch_search_tasks")
          .update({ status: "main_found", main_load_candidate_id: params.id })
          .eq("id", cand.search_task_id);
        await logAgentEvent(auth.client, auth.userId, cand.search_task_id, params.id,
          "main_load_selected", "Диспетчер выбрал основной груз");
        return jsonResponse({ ok: true, row: cand });
      },
    },
  },
});
