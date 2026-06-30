// GET список звонков для всех кандидатов в задаче.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/tasks/$id/call-list")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c: any = auth.client;
        const { data: cands } = await c
          .from("ai_dispatch_load_candidates").select("id")
          .eq("search_task_id", params.id);
        const ids = ((cands ?? []) as Array<{ id: string }>).map((x) => x.id);
        if (ids.length === 0) return jsonResponse({ rows: [] });
        const { data, error } = await c
          .from("ai_dispatch_call_logs").select("*")
          .in("candidate_id", ids).order("created_at", { ascending: false });
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ rows: data ?? [] });
      },
    },
  },
});
