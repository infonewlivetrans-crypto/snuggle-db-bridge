import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { createDealDraftFromBundle } from "@/server/ai-dispatcher/create-deal-from-candidate.server";

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/bundles/$id/create-deal")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        try {
          const res = await createDealDraftFromBundle(auth.client, auth.userId, params.id);
          return jsonResponse(res);
        } catch (e) {
          return jsonResponse({ error: e instanceof Error ? e.message : "error" }, { status: 400 });
        }
      },
    },
  },
});
