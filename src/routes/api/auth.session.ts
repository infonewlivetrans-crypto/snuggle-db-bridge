// GET /api/auth/session — возвращает { user_id } если cookie-сессия валидна,
// иначе { user_id: null }. Используется фронтом при загрузке страницы.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse } from "@/server/api-helpers.server";
import { getSessionUser } from "@/server/auth-cookies.server";

export const Route = createFileRoute("/api/auth/session")({
  server: {
    handlers: {
      GET: async () => {
        const auth = await getSessionUser();
        return jsonResponse(
          { user_id: auth?.userId ?? null },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
