// GET/PATCH одной задачи поиска.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

const ROLES = ["admin", "dispatcher"];

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/tasks/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c: any = auth.client;
        const [task, candidates, events] = await Promise.all([
          c.from("ai_dispatch_search_tasks").select("*").eq("id", params.id).maybeSingle(),
          c.from("ai_dispatch_load_candidates").select("*").eq("search_task_id", params.id)
            .order("match_score", { ascending: false }),
          c.from("ai_dispatch_agent_events").select("*").eq("search_task_id", params.id)
            .order("created_at", { ascending: false }).limit(100),
        ]);
        if (!task.data) return jsonResponse({ error: "not_found" }, { status: 404 });
        return jsonResponse({
          task: task.data,
          candidates: candidates.data ?? [],
          events: events.data ?? [],
        });
      },
      PATCH: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = await request.json().catch(() => ({}));
        const allowed = [
          "status", "auto_refresh_enabled", "refresh_interval_seconds",
          "notes", "main_load_candidate_id", "vehicle_params_json",
          "start_city", "destination_city", "start_radius_km", "destination_radius_km",
          "min_price", "min_price_per_km",
          "target_total_price", "target_price_per_km", "target_net_profit", "target_bundle_price",
          "max_bundle_items", "bundle_search_enabled", "stop_search_when_target_reached",
          "fuel_consumption_l_per_100km", "fuel_price_per_l", "other_expenses", "commission_percent",
        ];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const patch: any = {};
        for (const k of allowed) if (k in body) patch[k] = body[k];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c: any = auth.client;
        const { data, error } = await c
          .from("ai_dispatch_search_tasks")
          .update(patch).eq("id", params.id).select("*").single();
        if (error) return jsonResponse({ error: error.message }, { status: 400 });
        return jsonResponse({ row: data });
      },
    },
  },
});
