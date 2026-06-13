import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

const ALLOWED_ROLES = ["admin"];

export const Route = createFileRoute("/api/admin/dispatcher-user-invites/$id/revoke")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (auth.client as any).rpc(
          "admin_revoke_dispatcher_user_invite",
          { p_invite_id: params.id },
        );
        if (error) return jsonResponse({ error: error.message }, { status: 400 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
