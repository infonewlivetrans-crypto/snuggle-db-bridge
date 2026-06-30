import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/candidates/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = await request.json().catch(() => ({}));
        const allowed = ["status", "dispatcher_decision", "dispatcher_comment",
          "contact_allowed"];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const patch: any = {};
        for (const k of allowed) if (k in body) patch[k] = body[k];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c: any = auth.client;
        const { data, error } = await c
          .from("ai_dispatch_load_candidates")
          .update(patch).eq("id", params.id).select("*").single();
        if (error) return jsonResponse({ error: error.message }, { status: 400 });
        return jsonResponse({ row: data });
      },
    },
  },
});
