import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { recalculateBundle } from "@/server/ai-dispatcher/load-bundles.server";

const ROLES = ["admin", "dispatcher"];

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/bundles/$id/recalculate")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        await recalculateBundle(auth.client, params.id);
        return jsonResponse({ ok: true });
      },
    },
  },
});
