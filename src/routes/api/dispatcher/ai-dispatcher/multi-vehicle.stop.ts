import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

const ROLES = ["admin", "dispatcher"];

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/multi-vehicle/stop")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = await request.json().catch(() => ({}));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c: any = auth.client;
        const groupId: string | undefined = body.group_id;
        if (!groupId) return jsonResponse({ error: "group_id_required" }, { status: 400 });
        await c.from("ai_dispatch_search_tasks")
          .update({ status: "stopped", auto_refresh_enabled: false })
          .eq("multi_vehicle_group_id", groupId);
        return jsonResponse({ ok: true });
      },
    },
  },
});
