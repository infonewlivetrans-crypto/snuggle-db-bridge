import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  jsonResponse,
  makeAdminClient,
  requireAnyRole,
} from "@/server/api-helpers.server";

// Управление ссылками для регистрации кабинета перевозчика
// (carrier_account_links). Использует service_role для записи токена,
// но НЕ создаёт auth-пользователя. Сам аккаунт создаёт перевозчик
// публично через supabase.auth.signUp, а связь оформляется SECURITY DEFINER
// RPC claim_carrier_account_link(token) уже от имени нового пользователя.
//
// Методы:
//   GET    ?ext_id=...           → список ссылок для карточки
//   POST   { ext_id, ttl_days? } → создать новую ссылку
//   DELETE ?id=...               → отозвать ссылку (revoked_at = now())

const PostSchema = z.object({
  ext_id: z.string().uuid(),
  ttl_days: z.number().int().min(1).max(60).optional().default(14),
});

type LinkRow = {
  id: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  used_by: string | null;
  revoked_at: string | null;
  created_at: string;
};

function randomToken(): string {
  // 32 hex chars; криптостойко на VPS (Node crypto) и в воркере.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: Crypto | undefined = (globalThis as any).crypto;
  if (c?.getRandomValues) {
    const buf = new Uint8Array(24);
    c.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  let out = "";
  for (let i = 0; i < 48; i++) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

export const Route = createFileRoute("/api/dispatcher/carrier-link/invites")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const extId = url.searchParams.get("ext_id");
        if (!extId) return jsonResponse({ error: "ext_id required" }, { status: 400 });

        const admin = makeAdminClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (admin.from("carrier_account_links" as never) as any)
          .select("id, token, expires_at, used_at, used_by, revoked_at, created_at")
          .eq("dispatcher_carrier_ext_id", extId)
          .order("created_at", { ascending: false });
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true, rows: (data ?? []) as LinkRow[] });
      },

      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        let body: unknown;
        try { body = await request.json(); }
        catch { return jsonResponse({ error: "invalid_json" }, { status: 400 }); }
        const parsed = PostSchema.safeParse(body);
        if (!parsed.success) {
          return jsonResponse(
            { error: "validation_failed", issues: parsed.error.issues },
            { status: 400 },
          );
        }
        const { ext_id, ttl_days } = parsed.data;
        const admin = makeAdminClient();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ext = await (admin.from("dispatcher_carrier_ext") as any)
          .select("id").eq("id", ext_id).maybeSingle();
        if (!ext.data) return jsonResponse({ error: "ext_not_found" }, { status: 404 });

        const token = randomToken();
        const expires = new Date(Date.now() + ttl_days * 86400_000).toISOString();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ins = await (admin.from("carrier_account_links" as never) as any)
          .insert({
            token,
            dispatcher_carrier_ext_id: ext_id,
            created_by: auth.userId,
            expires_at: expires,
          })
          .select("id, token, expires_at, used_at, used_by, revoked_at, created_at")
          .single();
        if (ins.error) return jsonResponse({ error: ins.error.message }, { status: 500 });
        return jsonResponse({ ok: true, link: ins.data as LinkRow });
      },

      DELETE: async ({ request }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        if (!id) return jsonResponse({ error: "id required" }, { status: 400 });
        const admin = makeAdminClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (admin.from("carrier_account_links" as never) as any)
          .update({ revoked_at: new Date().toISOString() })
          .eq("id", id);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
