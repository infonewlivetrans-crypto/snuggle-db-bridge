import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";

// GET — список приглашений водителей перевозчика.
// POST — создать новое приглашение. Возвращает токен и готовую ссылку.
// Ссылка многоразовая в рабочем смысле: статус остаётся 'active' до expires_at,
// чтобы водитель мог открыть с любого устройства и повторно.

const PUBLIC_APP_URL = "https://radius-track.ru";


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

        // SECURITY DEFINER RPC обходит RLS carrier_invites, но проверяет,
        // что текущий пользователь — перевозчик (carrier_my_ext_id()).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (ctx.client.rpc as any)(
          "carrier_create_driver_invite",
          { p_ttl_days: 30 },
        );
        if (error) {
          return jsonResponse(
            { error: "rpc_failed", detail: error.message },
            { status: 400 },
          );
        }
        const row = Array.isArray(data) ? data[0] : data;
        if (!row?.token) {
          return jsonResponse({ error: "no_invite_returned" }, { status: 500 });
        }
        return jsonResponse(
          {
            row: {
              id: row.id,
              token: row.token,
              invite_type: "driver",
              status: row.status,
              expires_at: row.expires_at,
              created_at: row.created_at,
              invite_url: inviteUrl(row.token),
            },
          },
          { status: 201 },
        );
      },
    },
  },
});
