import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

const ALLOWED_ROLES = ["admin", "logist", "manager"];

function generateToken(): string {
  // 32 байта = 256 бит энтропии → base64url ~ 43 символа
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type OrderRow = {
  recipient_access_token: string | null;
  recipient_access_enabled: boolean;
  recipient_access_created_at: string | null;
  recipient_access_revoked_at: string | null;
};

async function readOrder(
  client: Awaited<ReturnType<typeof requireAnyRole>> extends infer T
    ? T extends { client: infer C }
      ? C
      : never
    : never,
  id: string,
): Promise<OrderRow | null> {
  const { data } = await (client as never as {
    from: (t: string) => {
      select: (s: string) => {
        eq: (
          c: string,
          v: string,
        ) => { maybeSingle: () => Promise<{ data: OrderRow | null }> };
      };
    };
  })
    .from("orders")
    .select(
      "recipient_access_token, recipient_access_enabled, recipient_access_created_at, recipient_access_revoked_at",
    )
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}

export const Route = createFileRoute("/api/orders/$id/recipient-link")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        const row = await readOrder(auth.client as never, params.id);
        if (!row) return jsonResponse({ error: "not_found" }, { status: 404 });
        const active =
          !!row.recipient_access_token &&
          row.recipient_access_enabled &&
          !row.recipient_access_revoked_at;
        return jsonResponse({
          token: active ? row.recipient_access_token : null,
          enabled: row.recipient_access_enabled,
          createdAt: row.recipient_access_created_at,
          revokedAt: row.recipient_access_revoked_at,
        });
      },
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        const row = await readOrder(auth.client as never, params.id);
        if (!row) return jsonResponse({ error: "not_found" }, { status: 404 });

        // Идемпотентность: если активная ссылка уже есть — возвращаем её.
        if (
          row.recipient_access_token &&
          row.recipient_access_enabled &&
          !row.recipient_access_revoked_at
        ) {
          return jsonResponse({
            token: row.recipient_access_token,
            enabled: true,
            createdAt: row.recipient_access_created_at,
            revokedAt: null,
            reused: true,
          });
        }

        const token = generateToken();
        const nowIso = new Date().toISOString();
        const { error } = await (auth.client as never as {
          from: (t: string) => {
            update: (u: Record<string, unknown>) => {
              eq: (
                c: string,
                v: string,
              ) => Promise<{ error: { message: string } | null }>;
            };
          };
        })
          .from("orders")
          .update({
            recipient_access_token: token,
            recipient_access_enabled: true,
            recipient_access_created_at: nowIso,
            recipient_access_revoked_at: null,
          })
          .eq("id", params.id);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({
          token,
          enabled: true,
          createdAt: nowIso,
          revokedAt: null,
          reused: false,
        });
      },
      DELETE: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        const nowIso = new Date().toISOString();
        const { error } = await (auth.client as never as {
          from: (t: string) => {
            update: (u: Record<string, unknown>) => {
              eq: (
                c: string,
                v: string,
              ) => Promise<{ error: { message: string } | null }>;
            };
          };
        })
          .from("orders")
          .update({
            recipient_access_enabled: false,
            recipient_access_revoked_at: nowIso,
          })
          .eq("id", params.id);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
