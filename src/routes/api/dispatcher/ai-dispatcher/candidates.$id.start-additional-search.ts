// Создаёт задачу поиска догруза, привязанную к основному кандидату.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { logAgentEvent, mockOpenAti } from "@/server/ai-dispatcher/mock-agent.server";

export const Route = createFileRoute(
  "/api/dispatcher/ai-dispatcher/candidates/$id/start-additional-search",
)({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c: any = auth.client;
        const { data: main } = await c
          .from("ai_dispatch_load_candidates").select("*").eq("id", params.id).single();
        if (!main) return jsonResponse({ error: "not_found" }, { status: 404 });
        const { data: parent } = await c
          .from("ai_dispatch_search_tasks").select("*")
          .eq("id", main.search_task_id).single();
        const { data: task, error } = await c
          .from("ai_dispatch_search_tasks").insert({
            dispatcher_id: auth.userId,
            search_mode: "additional_load",
            status: "draft",
            vehicle_source: parent?.vehicle_source ?? "manual_profile",
            vehicle_id: parent?.vehicle_id ?? null,
            driver_id: parent?.driver_id ?? null,
            manual_vehicle_json: parent?.manual_vehicle_json ?? null,
            vehicle_params_json: parent?.vehicle_params_json ?? null,
            start_city: main.pickup_city,
            destination_city: main.delivery_city,
            parent_task_id: main.search_task_id,
            main_load_candidate_id: main.id,
            refresh_interval_seconds: 60,
          }).select("*").single();
        if (error) return jsonResponse({ error: error.message }, { status: 400 });
        await logAgentEvent(auth.client, auth.userId, task.id, main.id,
          "additional_search_requested", "Запущен поиск догруза");
        await mockOpenAti(auth.client, auth.userId, task.id);
        return jsonResponse({ row: task });
      },
    },
  },
});
