import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { requestRecheck } from "@/server/ai-dispatcher/missing-candidates.server";

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/candidates/$id/recheck")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        try {
          const res = await requestRecheck(auth.client, auth.userId, params.id);
          return jsonResponse({ ok: true, ...res });
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 400 });
        }
      },
    },
  },
});
