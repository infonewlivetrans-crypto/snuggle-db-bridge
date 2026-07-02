import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { closeTab } from "@/server/ai-dispatcher/agent-tabs.server";

const ROLES = ["admin", "dispatcher"];

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/agent/tabs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c: any = auth.client;
        const { data } = await c.from("ai_dispatch_agent_tabs")
          .select("*")
          .eq("dispatcher_id", auth.userId)
          .neq("tab_status", "closed")
          .order("opened_at", { ascending: false })
          .limit(30);
        return jsonResponse({ rows: data ?? [] });
      },
      DELETE: async ({ request }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        if (!id) return jsonResponse({ error: "id_required" }, { status: 400 });
        await closeTab(auth.client, auth.userId, id, "manual_dispatcher");
        return jsonResponse({ ok: true });
      },
    },
  },
});
