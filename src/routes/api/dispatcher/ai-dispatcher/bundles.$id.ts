import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { recalculateBundle } from "@/server/ai-dispatcher/load-bundles.server";

const ROLES = ["admin", "dispatcher"];

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/bundles/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c: any = auth.client;
        const { data: bundle } = await c.from("ai_dispatch_load_bundles").select("*").eq("id", params.id).single();
        if (!bundle) return jsonResponse({ error: "not_found" }, { status: 404 });
        const { data: items } = await c.from("ai_dispatch_load_bundle_items").select("*").eq("bundle_id", params.id).order("sequence_number");
        const ids = (items ?? []).map((i: { candidate_id: string }) => i.candidate_id);
        let candidates: unknown[] = [];
        if (ids.length > 0) {
          const { data } = await c.from("ai_dispatch_load_candidates").select("*").in("id", ids);
          candidates = data ?? [];
        }
        return jsonResponse({ bundle, items: items ?? [], candidates });
      },
      PATCH: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = await request.json().catch(() => ({}));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c: any = auth.client;
        const patch: Record<string, unknown> = {};
        if (body.status) patch.status = body.status;
        if (body.ai_summary !== undefined) patch.ai_summary = body.ai_summary;
        const { error } = await c.from("ai_dispatch_load_bundles").update(patch).eq("id", params.id);
        if (error) return jsonResponse({ error: error.message }, { status: 400 });
        return jsonResponse({ ok: true });
      },
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        await recalculateBundle(auth.client, params.id);
        return jsonResponse({ ok: true });
      },
    },
  },
});
