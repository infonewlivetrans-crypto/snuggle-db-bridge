import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { dispatcherInviteUrl } from "@/lib/dispatcher/invites";

const TABLE = "dispatcher_invite_tokens";
const ALLOWED_ROLES = ["admin", "dispatcher"];

const SELECT =
  "id, token, invite_type, related_entity_type, related_entity_id, expires_at, used_at, revoked_at, created_by, created_at, updated_at";

const INVITE_TYPES = new Set([
  "carrier_registration",
  "driver_registration",
  "vehicle_registration",
  "carrier_driver_registration",
]);
const ENTITY_TYPES = new Set(["carrier", "driver", "vehicle"]);

function genToken(): string {
  // 32 случайных байта в hex = 64 символа. Достаточно случайности (~256 бит).
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const Route = createFileRoute("/api/dispatcher/invites")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const state = url.searchParams.get("state"); // active | used | revoked | expired | all
        const entityType = url.searchParams.get("entity_type");
        const entityId = url.searchParams.get("entity_id");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = (auth.client.from(TABLE as never) as any)
          .select(SELECT, { count: "exact" });

        if (entityType && ENTITY_TYPES.has(entityType)) {
          q = q.eq("related_entity_type", entityType);
        }
        if (entityId) q = q.eq("related_entity_id", entityId);

        if (state === "active") {
          q = q.is("used_at", null).is("revoked_at", null);
        } else if (state === "used") {
          q = q.not("used_at", "is", null);
        } else if (state === "revoked") {
          q = q.not("revoked_at", "is", null);
        }

        q = q.order("created_at", { ascending: false }).limit(200);
        const { data, error, count } = await q;
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ rows: data ?? [], total: count ?? data?.length ?? 0 });
      },

      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "invalid JSON" }, { status: 400 });
        }
        const b = (body ?? {}) as {
          invite_type?: string;
          related_entity_type?: string;
          related_entity_id?: string;
          expires_in_days?: number;
        };
        if (!b.invite_type || !INVITE_TYPES.has(b.invite_type)) {
          return jsonResponse({ error: "invalid invite_type" }, { status: 400 });
        }
        if (!b.related_entity_type || !ENTITY_TYPES.has(b.related_entity_type)) {
          return jsonResponse({ error: "invalid related_entity_type" }, { status: 400 });
        }
        if (!b.related_entity_id || !/^[0-9a-f-]{36}$/i.test(b.related_entity_id)) {
          return jsonResponse({ error: "invalid related_entity_id" }, { status: 400 });
        }
        const days = Math.min(Math.max(Number(b.expires_in_days) || 14, 1), 90);
        const expires_at = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();

        const token = genToken();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client.from(TABLE as never) as any)
          .insert({
            token,
            invite_type: b.invite_type,
            related_entity_type: b.related_entity_type,
            related_entity_id: b.related_entity_id,
            expires_at,
            created_by: auth.userId,
          } as never)
          .select(SELECT)
          .single();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(
          { row: data, invite_url: dispatcherInviteUrl(token) },
          { status: 201 },
        );
      },
    },
  },
});
