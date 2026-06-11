import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

/**
 * Заглушка эндпоинта синхронизации входящей почты.
 * Реальный IMAP/Gmail sync не подключён: безопасное хранение паролей и
 * фоновые задачи появятся на следующем этапе. Эндпоинт существует, чтобы
 * фронтенд мог отображать кнопку «Проверить почту» и не падать при вызове.
 */
export const Route = createFileRoute("/api/dispatcher/incoming-email/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        return jsonResponse({
          ok: true,
          fetched: 0,
          imported: 0,
          skipped: 0,
          message:
            "Автоматическая синхронизация почты пока не подключена. Используйте ручной импорт письма.",
        });
      },
    },
  },
});
