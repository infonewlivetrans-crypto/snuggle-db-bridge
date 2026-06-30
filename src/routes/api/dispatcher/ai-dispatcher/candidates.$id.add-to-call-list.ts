import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { logAgentEvent } from "@/server/ai-dispatcher/mock-agent.server";

export const Route = createFileRoute(
  "/api/dispatcher/ai-dispatcher/candidates/$id/add-to-call-list",
)({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c: any = auth.client;
        const { data, error } = await c.from("ai_dispatch_call_logs").insert({
          candidate_id: params.id,
          dispatcher_id: auth.userId,
          call_status: "planned",
        }).select("*").single();
        if (error) return jsonResponse({ error: error.message }, { status: 400 });
        const { data: cand } = await c
          .from("ai_dispatch_load_candidates").select("search_task_id").eq("id", params.id).single();
        await logAgentEvent(auth.client, auth.userId, cand?.search_task_id ?? null, params.id,
          "call_list_added", "Груз добавлен в список звонков");
        return jsonResponse({ row: data });
      },
    },
  },
});
