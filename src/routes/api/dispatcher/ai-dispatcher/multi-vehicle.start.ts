import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { logAgentEvent, mockRefreshTask } from "@/server/ai-dispatcher/mock-agent.server";

const ROLES = ["admin", "dispatcher"];

// Multi-vehicle: запуск группы задач.
export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/multi-vehicle/start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = await request.json().catch(() => ({}));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c: any = auth.client;
        const vehicles: Array<Record<string, unknown>> = Array.isArray(body.vehicles) ? body.vehicles : [];
        if (vehicles.length === 0) return jsonResponse({ error: "vehicles_required" }, { status: 400 });
        const groupId = crypto.randomUUID();
        const created: string[] = [];
        for (const v of vehicles) {
          const payload = {
            dispatcher_id: auth.userId,
            search_mode: "main_load",
            status: "searching",
            vehicle_source: v.vehicle_id ? "existing_vehicle" : "manual_profile",
            vehicle_id: v.vehicle_id ?? null,
            manual_vehicle_json: v.vehicle_id ? null : (v.manual_vehicle_json ?? null),
            start_city: v.start_city ?? null,
            destination_city: v.destination_city ?? null,
            vehicle_params_json: v.vehicle_params_json ?? null,
            ati_filters_json: v.ati_filters_json ?? body.ati_filters_json ?? null,
            multi_vehicle_group_id: groupId,
            is_multi_vehicle_member: true,
            auto_refresh_enabled: true,
            refresh_interval_seconds: body.refresh_interval_seconds ?? 60,
          };
          const { data } = await c.from("ai_dispatch_search_tasks").insert(payload).select("id").single();
          if (data?.id) created.push(data.id);
        }
        await logAgentEvent(auth.client, auth.userId, null, null,
          "multi_vehicle_cycle_started",
          `Запущена группа поиска: ${created.length} машин`);
        return jsonResponse({ group_id: groupId, task_ids: created });
      },
    },
  },
});
