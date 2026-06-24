// API: завершение тренажёра ЭПД.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { completeTraining } from "@/server/edo/training.server";

export const Route = createFileRoute("/api/carrier/edo/training/$id/complete")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        try {
          await completeTraining(auth.client, auth.userId, params.id);
          return jsonResponse({ ok: true });
        } catch (e) {
          return jsonResponse({ error: "complete_failed", message: e instanceof Error ? e.message : String(e) }, { status: 400 });
        }
      },
    },
  },
});
