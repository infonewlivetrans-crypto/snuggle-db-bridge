// GET /api/auth/has-admin — проверка, есть ли в системе хотя бы один админ.
// Публичный эндпоинт (без auth) — нужен на экране первой настройки.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse } from "@/server/api-helpers.server";
import { hasAnyAdmin } from "@/server/users.server";

export const Route = createFileRoute("/api/auth/has-admin")({
  server: {
    handlers: {
      GET: async () => {
        try {
          return jsonResponse({ has_admin: await hasAnyAdmin() });
        } catch (e) {
          const message = e instanceof Error ? e.message : "internal error";
          return jsonResponse({ error: message, has_admin: true }, { status: 500 });
        }
      },
    },
  },
});
