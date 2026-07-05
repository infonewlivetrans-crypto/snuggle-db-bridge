import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { restoreCandidate } from "@/server/ai-dispatcher/missing-candidates.server";

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/candidates/$id/restore")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        try {
          await restoreCandidate(auth.client, auth.userId, params.id);
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 400 });
        }
        return jsonResponse({ ok: true });
      },
    },
  },
});
