import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";

// GET — список приглашений водителей перевозчика.
// POST — создать новое приглашение. Возвращает токен и готовую ссылку.
// Ссылка многоразовая в рабочем смысле: статус остаётся 'active' до expires_at,
// чтобы водитель мог открыть с любого устройства и повторно.

const PUBLIC_APP_URL = "https://radius-track.ru";

function generateToken(): string {
  // 32 hex chars из crypto. На Worker есть crypto.getRandomValues.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function inviteUrl(token: string): string {
  return `${PUBLIC_APP_URL.replace(/\/+$/, "")}/driver/register/${token}`;
}

export const Route = createFileRoute("/api/carrier/driver-invites")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ["carrier", "admin"]);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (ctx.admin.from("carrier_invites" as never) as any)
          .select("id, token, invite_type, status, expires_at, created_at")
          .eq("carrier_id", ctx.carrierId)
          .eq("invite_type", "driver")
          .order("created_at", { ascending: false });
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        const rows = (data ?? []).map((r: { token: string }) => ({
          ...r,
          invite_url: inviteUrl(r.token),
        }));
        return jsonResponse({ rows });
      },

      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ["carrier", "admin"]);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;

        const token = generateToken();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (ctx.admin.from("carrier_invites" as never) as any)
          .insert({
            token,
            invite_type: "driver",
            carrier_id: ctx.carrierId,
            status: "active",
            expires_at: expiresAt,
          } as never)
          .select("id, token, invite_type, status, expires_at, created_at")
          .single();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ row: { ...data, invite_url: inviteUrl(data.token) } }, { status: 201 });
      },
    },
  },
});
