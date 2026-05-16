import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

type ClientRow = {
  id: string;
  portal_token: string | null;
  portal_access_enabled: boolean;
  portal_token_created_at: string | null;
  portal_token_revoked_at: string | null;
};

type StaffPortalState = {
  has_token: boolean;
  active: boolean;
  portal_token_created_at: string | null;
  portal_token_revoked_at: string | null;
  portal_access_enabled: boolean;
};

function publicUrl(request: Request, token: string): string {
  const u = new URL(request.url);
  return `${u.origin}/c/${token}`;
}

function statePayloadFromRow(request: Request, row: ClientRow) {
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
    portal_access_enabled: row.portal_access_enabled,
  };
}

function statePayloadFromStaffState(
  request: Request,
  state: StaffPortalState,
  token: string | null,
) {
  return {
    has_token: state.has_token,
    active: state.active,
    url: state.active && token ? publicUrl(request, token) : null,
    portal_token_created_at: state.portal_token_created_at,
    portal_token_revoked_at: state.portal_token_revoked_at,
    portal_access_enabled: state.portal_access_enabled,
  };
}

function mapRpcError(message: string): { status: number; code: string } {
  if (message.includes("portal_token_missing")) return { status: 409, code: "portal_token_missing" };
  if (message.includes("portal_token_revoked")) return { status: 409, code: "portal_token_revoked" };
  if (message.includes("not_found")) return { status: 404, code: "not_found" };
  if (message.includes("forbidden")) return { status: 403, code: "forbidden" };
  if (message.includes("unauthorized")) return { status: 401, code: "unauthorized" };
  return { status: 500, code: message };
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
        return jsonResponse(statePayloadFromRow(request, data as ClientRow));
      },

      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "logist", "manager"]);
        if (auth instanceof Response) return auth;

        const url = new URL(request.url);
        const rotate = url.searchParams.get("rotate") === "1";

        if (rotate) {
          const { data, error } = await auth.client.rpc("staff_rotate_portal_token", {
            _client_id: params.id,
          });
          if (error) {
            const m = mapRpcError(error.message);
            return jsonResponse({ error: m.code }, { status: m.status });
          }
          const row = Array.isArray(data) ? data[0] : data;
          if (!row) return jsonResponse({ error: "update_failed" }, { status: 500 });
          return jsonResponse(
            statePayloadFromStaffState(
              request,
              {
                has_token: row.has_token,
                active: row.active,
                portal_token_created_at: row.portal_token_created_at,
                portal_token_revoked_at: row.portal_token_revoked_at,
                portal_access_enabled: row.portal_access_enabled,
              },
              row.portal_token,
            ),
          );
        }

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
          return jsonResponse(statePayloadFromRow(request, row));
        }

        // First-time issue: rotate via RPC so logic stays centralized.
        const { data, error } = await auth.client.rpc("staff_rotate_portal_token", {
          _client_id: params.id,
        });
        if (error) {
          const m = mapRpcError(error.message);
          return jsonResponse({ error: m.code }, { status: m.status });
        }
        const r = Array.isArray(data) ? data[0] : data;
        if (!r) return jsonResponse({ error: "update_failed" }, { status: 500 });
        return jsonResponse(
          statePayloadFromStaffState(
            request,
            {
              has_token: r.has_token,
              active: r.active,
              portal_token_created_at: r.portal_token_created_at,
              portal_token_revoked_at: r.portal_token_revoked_at,
              portal_access_enabled: r.portal_access_enabled,
            },
            r.portal_token,
          ),
        );
      },

      PATCH: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "logist", "manager"]);
        if (auth instanceof Response) return auth;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "invalid_body" }, { status: 400 });
        }
        const enabled =
          body && typeof body === "object" && "enabled" in (body as Record<string, unknown>)
            ? (body as { enabled: unknown }).enabled
            : undefined;
        if (typeof enabled !== "boolean") {
          return jsonResponse({ error: "enabled_required" }, { status: 400 });
        }

        const { data, error } = await auth.client.rpc("staff_set_portal_enabled", {
          _client_id: params.id,
          _enabled: enabled,
        });
        if (error) {
          const m = mapRpcError(error.message);
          return jsonResponse({ error: m.code }, { status: m.status });
        }
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) return jsonResponse({ error: "update_failed" }, { status: 500 });

        // Need the token for url assembly — read it back (RLS-safe).
        const { data: c } = await auth.client
          .from("clients")
          .select("portal_token")
          .eq("id", params.id)
          .maybeSingle();
        return jsonResponse(
          statePayloadFromStaffState(
            request,
            {
              has_token: row.has_token,
              active: row.active,
              portal_token_created_at: row.portal_token_created_at,
              portal_token_revoked_at: row.portal_token_revoked_at,
              portal_access_enabled: row.portal_access_enabled,
            },
            (c?.portal_token as string | null | undefined) ?? null,
          ),
        );
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
        return jsonResponse(statePayloadFromRow(request, updated as ClientRow));
      },
    },
  },
});
