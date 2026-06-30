// AI Dispatcher: список и создание задач поиска.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { logAgentEvent } from "@/server/ai-dispatcher/mock-agent.server";

const ROLES = ["admin", "dispatcher"];

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/tasks")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c: any = auth.client;
        const { data, error } = await c
          .from("ai_dispatch_search_tasks")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ rows: data ?? [] });
      },
      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = await request.json().catch(() => ({}));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c: any = auth.client;
        const payload = {
          dispatcher_id: auth.userId,
          search_mode: body.search_mode ?? "main_load",
          status: "draft",
          vehicle_source: body.vehicle_source ?? "manual_profile",
          vehicle_id: body.vehicle_id ?? null,
          driver_id: body.driver_id ?? null,
          manual_vehicle_json: body.manual_vehicle_json ?? null,
          start_city: body.start_city ?? null,
          start_radius_km: body.start_radius_km ?? null,
          destination_city: body.destination_city ?? null,
          destination_radius_km: body.destination_radius_km ?? null,
          route_points_json: body.route_points_json ?? null,
          vehicle_params_json: body.vehicle_params_json ?? null,
          parent_task_id: body.parent_task_id ?? null,
          main_load_candidate_id: body.main_load_candidate_id ?? null,
          refresh_interval_seconds: body.refresh_interval_seconds ?? 60,
          notes: body.notes ?? null,
        };
        const { data, error } = await c
          .from("ai_dispatch_search_tasks")
          .insert(payload)
          .select("*")
          .single();
        if (error) return jsonResponse({ error: error.message }, { status: 400 });
        await logAgentEvent(auth.client, auth.userId, data.id, null,
          "search_button_clicked",
          "Создана задача поиска груза");
        return jsonResponse({ row: data });
      },
    },
  },
});
