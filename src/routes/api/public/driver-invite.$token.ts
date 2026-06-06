import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, makeAdminClient } from "@/server/api-helpers.server";

// GET /api/public/driver-invite/:token — проверка валидности приглашения.
// Публичный endpoint, не требует авторизации.

export const Route = createFileRoute("/api/public/driver-invite/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = params.token;
        if (!token || token.length > 200) {
          return jsonResponse({ ok: false, reason: "invalid_token" }, { status: 400 });
        }
        const admin = makeAdminClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: invite } = await (admin.from("carrier_invites" as never) as any)
          .select("id, carrier_id, invite_type, status, expires_at")
          .eq("token", token)
          .eq("invite_type", "driver")
          .maybeSingle();
        if (!invite) {
          return jsonResponse({ ok: false, reason: "not_found" }, { status: 404 });
        }
        if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
          return jsonResponse({ ok: false, reason: "expired" }, { status: 410 });
        }
        if (invite.status === "revoked") {
          return jsonResponse({ ok: false, reason: "revoked" }, { status: 410 });
        }
        const { data: carrier } = await admin
          .from("carriers")
          .select("id, company_name, city")
          .eq("id", invite.carrier_id)
          .maybeSingle();
        return jsonResponse({
          ok: true,
          carrier: carrier ?? null,
          expires_at: invite.expires_at,
        });
      },
    },
  },
});
