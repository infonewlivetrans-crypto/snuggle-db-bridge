import { createFileRoute } from "@tanstack/react-router";

// Лёгкий health-check без обращений к БД, внешним сервисам и геокодеру.
// Используется PM2/nginx/мониторингом и фронтом для проверки доступности.
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
          },
        }),
    },
  },
});
