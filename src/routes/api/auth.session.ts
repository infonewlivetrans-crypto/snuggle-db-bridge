// GET /api/auth/session — возвращает { user_id } если cookie-сессия валидна
// или передан валидный Bearer-токен (fallback для iframe-окружений, где
// httpOnly cookie может не сохраняться). Иначе { user_id: null }.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, resolveAuth } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/auth/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await resolveAuth(request);
        return jsonResponse(
          { user_id: auth?.userId ?? null },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
