import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

const TABLE = "dispatcher_invite_tokens";
const ALLOWED_ROLES = ["admin", "dispatcher"];

const SELECT =
  "id, token, invite_type, related_entity_type, related_entity_id, expires_at, used_at, revoked_at, created_by, created_at, updated_at";

export const Route = createFileRoute("/api/dispatcher/invites/$id/revoke")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client.from(TABLE as never) as any)
          .update({ revoked_at: new Date().toISOString() } as never)
          .eq("id", params.id)
          .is("used_at", null)
          .is("revoked_at", null)
          .select(SELECT)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (!data) return jsonResponse({ error: "not_found_or_already_consumed" }, { status: 404 });
        return jsonResponse({ row: data });
      },
    },
  },
});
