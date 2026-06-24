// API: шаг тренажёра ЭПД.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { stepTraining } from "@/server/edo/training.server";

export const Route = createFileRoute("/api/carrier/edo/training/$id/step")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const body = (await request.json().catch(() => ({}))) as { step?: number; progress?: number; mistake?: unknown };
        try {
          await stepTraining(auth.client, auth.userId, params.id, body);
          return jsonResponse({ ok: true });
        } catch (e) {
          return jsonResponse({ error: "step_failed", message: e instanceof Error ? e.message : String(e) }, { status: 400 });
        }
      },
    },
  },
});
