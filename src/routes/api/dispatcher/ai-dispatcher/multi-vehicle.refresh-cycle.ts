import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { logAgentEvent, mockRefreshTask } from "@/server/ai-dispatcher/mock-agent.server";

const ROLES = ["admin", "dispatcher"];

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/multi-vehicle/refresh-cycle")({
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
        const { data: tasks } = await c.from("ai_dispatch_search_tasks")
          .select("id").eq("multi_vehicle_group_id", groupId);
        const results: unknown[] = [];
        for (const t of (tasks ?? []) as Array<{ id: string }>) {
          const r = await mockRefreshTask(auth.client, auth.userId, t.id);
          results.push({ task_id: t.id, ...r });
        }
        await logAgentEvent(auth.client, auth.userId, null, null,
          "multi_vehicle_cycle_completed",
          `Цикл обновления группы: ${results.length} задач`);
        return jsonResponse({ ok: true, results });
      },
    },
  },
});
