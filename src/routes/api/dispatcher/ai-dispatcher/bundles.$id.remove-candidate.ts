import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { recalculateBundle } from "@/server/ai-dispatcher/load-bundles.server";

const ROLES = ["admin", "dispatcher"];

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/bundles/$id/remove-candidate")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = await request.json().catch(() => ({}));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c: any = auth.client;
        const cid: string | undefined = body.candidate_id;
        if (!cid) return jsonResponse({ error: "candidate_id_required" }, { status: 400 });
        await c.from("ai_dispatch_load_bundle_items").delete().eq("bundle_id", params.id).eq("candidate_id", cid);
        await c.from("ai_dispatch_load_candidates").update({ bundle_id: null }).eq("id", cid);
        await recalculateBundle(auth.client, params.id);
        return jsonResponse({ ok: true });
      },
    },
  },
});
