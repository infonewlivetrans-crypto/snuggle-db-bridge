import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/notifications/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const patch: Record<string, unknown> = {};
        if (body.is_read !== undefined) {
          patch.is_read = !!body.is_read;
          patch.read_at = body.is_read ? new Date().toISOString() : null;
        }
        if (Object.keys(patch).length === 0) {
          return jsonResponse({ error: "no_allowed_fields" }, { status: 400 });
        }
        const { error } = await auth.client
          .from("notifications")
          .update(patch as never)
          .eq("id", params.id);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
