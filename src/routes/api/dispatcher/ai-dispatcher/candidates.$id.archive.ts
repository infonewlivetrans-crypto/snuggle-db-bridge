import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { archiveCandidate } from "@/server/ai-dispatcher/missing-candidates.server";

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/candidates/$id/archive")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = await request.json().catch(() => ({}));
        try {
          await archiveCandidate(auth.client, auth.userId, params.id,
            typeof body.comment === "string" ? body.comment : undefined);
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 400 });
        }
        return jsonResponse({ ok: true });
      },
    },
  },
});
