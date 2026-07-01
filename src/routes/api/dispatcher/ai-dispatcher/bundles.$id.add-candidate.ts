import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { recalculateBundle } from "@/server/ai-dispatcher/load-bundles.server";

const ROLES = ["admin", "dispatcher"];

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/bundles/$id/add-candidate")({
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
        const { data: existing } = await c.from("ai_dispatch_load_bundle_items")
          .select("id").eq("bundle_id", params.id).order("sequence_number", { ascending: false }).limit(1);
        const seq = (existing?.length ?? 0) + 1;
        const { error } = await c.from("ai_dispatch_load_bundle_items").insert({
          bundle_id: params.id,
          candidate_id: cid,
          item_role: body.item_role ?? "additional",
          sequence_number: seq,
          pickup_order: seq,
          delivery_order: seq,
        });
        if (error) return jsonResponse({ error: error.message }, { status: 400 });
        await c.from("ai_dispatch_load_candidates").update({ bundle_id: params.id }).eq("id", cid);
        await recalculateBundle(auth.client, params.id);
        return jsonResponse({ ok: true });
      },
    },
  },
});
