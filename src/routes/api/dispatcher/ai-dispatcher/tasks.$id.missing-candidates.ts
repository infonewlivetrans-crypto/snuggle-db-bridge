import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { listMissingForTask } from "@/server/ai-dispatcher/missing-candidates.server";

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/tasks/$id/missing-candidates")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        try {
          const rows = await listMissingForTask(auth.client, auth.userId, params.id);
          return jsonResponse({ rows });
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 400 });
        }
      },
    },
  },
});
