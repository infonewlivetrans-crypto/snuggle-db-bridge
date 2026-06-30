import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/tasks/$id/agent/start")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c: any = auth.client;
        await c.from("ai_dispatch_search_tasks")
          .update({ status: "searching", auto_refresh_enabled: true })
          .eq("id", params.id);
        return jsonResponse({ ok: true });
      },
    },
  },
});
