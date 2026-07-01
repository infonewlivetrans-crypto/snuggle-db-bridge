import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { buildLoadBundle } from "@/server/ai-dispatcher/load-bundles.server";
import { logAgentEvent } from "@/server/ai-dispatcher/mock-agent.server";

const ROLES = ["admin", "dispatcher"];

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/bundles")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c: any = auth.client;
        const { data, error } = await c.from("ai_dispatch_load_bundles")
          .select("*").order("created_at", { ascending: false }).limit(100);
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
        const mainId: string | undefined = body.main_candidate_id;
        const addIds: string[] = Array.isArray(body.additional_candidate_ids) ? body.additional_candidate_ids : [];
        if (!mainId) return jsonResponse({ error: "main_candidate_id_required" }, { status: 400 });
        const { data: main } = await c.from("ai_dispatch_load_candidates").select("*").eq("id", mainId).single();
        if (!main) return jsonResponse({ error: "main_not_found" }, { status: 404 });
        let add: unknown[] = [];
        if (addIds.length > 0) {
          const { data } = await c.from("ai_dispatch_load_candidates").select("*").in("id", addIds);
          add = data ?? [];
        }
        let vehicle = { id: body.vehicle_id ?? null, capacity_t: body.capacity_t ?? null, volume_m3: body.volume_m3 ?? null, body_type: body.body_type ?? null };
        if (body.vehicle_id) {
          const { data: v } = await c.from("vehicles").select("id, capacity_t, volume_m3, body_type").eq("id", body.vehicle_id).single();
          if (v) vehicle = { ...vehicle, ...v };
        }
        const result = await buildLoadBundle(auth.client, auth.userId, {
          vehicle,
          searchTaskId: body.search_task_id ?? main.search_task_id ?? null,
          mainCandidate: main,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          additionalCandidates: add as any,
          bundle_type: body.bundle_type,
        });
        await logAgentEvent(auth.client, auth.userId, main.search_task_id, mainId,
          "bundle_suggested", `Собрана связка (${1 + addIds.length} груз(ов))`);
        return jsonResponse({ id: result.bundleId, report: result.report });
      },
    },
  },
});
