// API: старт учебной сессии тренажёра ЭПД.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { startTraining } from "@/server/edo/training.server";
import type { EpdScenarioType } from "@/lib/edo/scenarios";

export const Route = createFileRoute("/api/carrier/edo/training/start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const body = (await request.json().catch(() => ({}))) as { role?: string; scenario_type?: EpdScenarioType };
        try {
          const r = await startTraining(auth.client, auth.userId, {
            role: body.role ?? "carrier",
            scenario_type: (body.scenario_type ?? "regular_transport") as EpdScenarioType,
          });
          return jsonResponse(r);
        } catch (e) {
          return jsonResponse({ error: "start_failed", message: e instanceof Error ? e.message : String(e) }, { status: 400 });
        }
      },
    },
  },
});
