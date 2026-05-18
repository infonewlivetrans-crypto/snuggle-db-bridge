import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, makeAdminClient } from "@/server/api-helpers.server";

/**
 * Публичный резолвер ссылки водителя: /d/:token → delivery_route id.
 * Возвращает только id и driver_access_enabled. Не требует сессии,
 * чтобы водитель мог открыть свою ссылку без логина.
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
        const admin = makeAdminClient();
        const { data, error } = await admin
          .from("delivery_routes")
          .select("id, driver_access_enabled")
          .eq("driver_access_token", token)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (!data) return jsonResponse(null, { status: 404 });
        return jsonResponse(data);
      },
    },
  },
});
