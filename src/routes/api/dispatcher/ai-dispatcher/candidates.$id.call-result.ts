import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { logAgentEvent } from "@/server/ai-dispatcher/mock-agent.server";

export const Route = createFileRoute(
  "/api/dispatcher/ai-dispatcher/candidates/$id/call-result",
)({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = await request.json().catch(() => ({}));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c: any = auth.client;
        const { data, error } = await c.from("ai_dispatch_call_logs").insert({
          candidate_id: params.id,
          dispatcher_id: auth.userId,
          call_status: body.call_status ?? "called",
          call_result: body.call_result ?? null,
          comment: body.comment ?? null,
          called_at: new Date().toISOString(),
        }).select("*").single();
        if (error) return jsonResponse({ error: error.message }, { status: 400 });
        await logAgentEvent(auth.client, auth.userId, null, params.id,
          "call_result_saved", `Результат звонка: ${body.call_result ?? body.call_status ?? "—"}`);
        return jsonResponse({ row: data });
      },
    },
  },
});
