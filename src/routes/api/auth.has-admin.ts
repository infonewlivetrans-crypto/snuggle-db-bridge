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
          // Не возвращаем 500 на этом маленьком публичном эндпоинте — он
          // вызывается на каждой странице (AuthGate/FirstRun) и не должен
          // ронять основной UI, если backend временно недоступен или env
          // не сконфигурирован на VPS. Возвращаем безопасный дефолт
          // (has_admin: true → не показывать экран первой настройки).
          const message = e instanceof Error ? e.message : "internal error";
          console.error("/api/auth/has-admin error:", message);
          return jsonResponse({ has_admin: true, degraded: true, error: message });
        }
      },
    },
  },
});
