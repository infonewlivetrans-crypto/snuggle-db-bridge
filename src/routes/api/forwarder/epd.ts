// API: заготовка раздела ЭПД у экспедитора. В этом этапе — только заглушка
// для интеграционной точки. Экспедитор пока пользуется готовностью своего
// перевозчика-партнёра и статусом ГосЛог.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/forwarder/epd")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        return jsonResponse({
          ok: true,
          user_id: auth.userId,
          notice: "Раздел ЭПД у экспедитора — заготовка. Используйте ГосЛог и сценарии перевозчика.",
        });
      },
    },
  },
});
