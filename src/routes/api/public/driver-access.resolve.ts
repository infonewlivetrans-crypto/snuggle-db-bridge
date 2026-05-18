import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, makeAnonClient } from "@/server/api-helpers.server";

/**
 * Публичный резолвер ссылки водителя: /d/:token → delivery_route id.
 * Не использует service_role / admin-клиент. Безопасный минимум полей
 * возвращается через SECURITY DEFINER RPC `get_driver_access_route_by_token`,
 * у которой EXECUTE выдан anon/authenticated.
 *
 * Возвращает только { id, driver_access_enabled }, ничего больше.
 */
export const Route = createFileRoute("/api/public/driver-access/resolve")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = (url.searchParams.get("token") ?? "").trim();
        if (!token || token.length < 8 || token.length > 128) {
          return jsonResponse({ error: "invalid_token" }, { status: 400 });
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(token)) {
          return jsonResponse({ error: "invalid_token" }, { status: 400 });
        }
        const sb = makeAnonClient();
        const { data, error } = await sb.rpc(
          "get_driver_access_route_by_token" as never,
          { p_token: token } as never,
        );
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        const row = Array.isArray(data) ? (data[0] as { id: string; driver_access_enabled: boolean } | undefined) : null;
        if (!row) return jsonResponse(null, { status: 404 });
        return jsonResponse({ id: row.id, driver_access_enabled: !!row.driver_access_enabled });
      },
    },
  },
});
