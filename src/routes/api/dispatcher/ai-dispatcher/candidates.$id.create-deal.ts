import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { createDealDraftFromCandidate } from "@/server/ai-dispatcher/create-deal-from-candidate.server";

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/candidates/$id/create-deal")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = await request.json().catch(() => ({}));
        try {
          const res = await createDealDraftFromCandidate(
            auth.client, auth.userId, params.id,
            { agreed_price: body?.agreed_price ?? null, comment: body?.comment ?? null },
          );
          return jsonResponse(res);
        } catch (e) {
          return jsonResponse({ error: e instanceof Error ? e.message : "error" }, { status: 400 });
        }
      },
    },
  },
});
