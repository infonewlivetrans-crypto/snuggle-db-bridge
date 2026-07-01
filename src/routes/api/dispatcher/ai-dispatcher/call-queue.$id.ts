import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

const ROLES = ["admin", "dispatcher"];

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/call-queue/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = await request.json().catch(() => ({}));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c: any = auth.client;
        const patch: Record<string, unknown> = {};
        for (const k of ["call_status", "call_result", "priority", "dispatcher_comment", "next_action_at"]) {
          if (body[k] !== undefined) patch[k] = body[k];
        }
        const { error } = await c.from("ai_dispatch_call_queue")
          .update(patch).eq("id", params.id).eq("dispatcher_id", auth.userId);
        if (error) return jsonResponse({ error: error.message }, { status: 400 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
