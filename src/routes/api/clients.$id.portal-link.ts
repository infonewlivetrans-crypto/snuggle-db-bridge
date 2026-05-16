import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

function generateToken(): string {
  // 32 bytes ~ 43 url-safe chars
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  // base64url
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type ClientRow = {
  id: string;
  portal_token: string | null;
  portal_access_enabled: boolean;
  portal_token_created_at: string | null;
  portal_token_revoked_at: string | null;
};

function publicUrl(request: Request, token: string): string {
  const u = new URL(request.url);
  return `${u.origin}/c/${token}`;
}

function statePayload(request: Request, row: ClientRow) {
  const active =
    row.portal_token != null &&
    row.portal_access_enabled === true &&
    row.portal_token_revoked_at == null;
  return {
    has_token: row.portal_token != null,
    active,
    url: active && row.portal_token ? publicUrl(request, row.portal_token) : null,
    portal_token_created_at: row.portal_token_created_at,
    portal_token_revoked_at: row.portal_token_revoked_at,
  };
}

const SELECT =
  "id, portal_token, portal_access_enabled, portal_token_created_at, portal_token_revoked_at";

export const Route = createFileRoute("/api/clients/$id/portal-link")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "logist", "manager"]);
        if (auth instanceof Response) return auth;
        const { data, error } = await auth.client
          .from("clients")
          .select(SELECT)
          .eq("id", params.id)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (!data) return jsonResponse({ error: "not_found" }, { status: 404 });
        return jsonResponse(statePayload(request, data as ClientRow));
      },

      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "logist", "manager"]);
        if (auth instanceof Response) return auth;

        const { data: existing, error: selErr } = await auth.client
          .from("clients")
          .select(SELECT)
          .eq("id", params.id)
          .maybeSingle();
        if (selErr) return jsonResponse({ error: selErr.message }, { status: 500 });
        if (!existing) return jsonResponse({ error: "not_found" }, { status: 404 });

        const row = existing as ClientRow;
        // Idempotent: if there is an active token already, return it.
        if (
          row.portal_token &&
          row.portal_access_enabled &&
          row.portal_token_revoked_at == null
        ) {
          return jsonResponse(statePayload(request, row));
        }

        const token = generateToken();
        const { data: updated, error: updErr } = await auth.client
          .from("clients")
          .update({
            portal_token: token,
            portal_access_enabled: true,
            portal_token_created_at: new Date().toISOString(),
            portal_token_revoked_at: null,
          })
          .eq("id", params.id)
          .select(SELECT)
          .maybeSingle();
        if (updErr) return jsonResponse({ error: updErr.message }, { status: 500 });
        if (!updated) return jsonResponse({ error: "update_failed" }, { status: 500 });
        return jsonResponse(statePayload(request, updated as ClientRow));
      },

      DELETE: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "logist", "manager"]);
        if (auth instanceof Response) return auth;

        const { data: updated, error: updErr } = await auth.client
          .from("clients")
          .update({
            portal_access_enabled: false,
            portal_token_revoked_at: new Date().toISOString(),
          })
          .eq("id", params.id)
          .select(SELECT)
          .maybeSingle();
        if (updErr) return jsonResponse({ error: updErr.message }, { status: 500 });
        if (!updated) return jsonResponse({ error: "not_found" }, { status: 404 });
        return jsonResponse(statePayload(request, updated as ClientRow));
      },
    },
  },
});
