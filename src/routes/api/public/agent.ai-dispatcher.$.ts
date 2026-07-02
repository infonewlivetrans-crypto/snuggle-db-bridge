// Публичные endpoints для будущего реального Radius Track Browser Agent.
// НА DEV-ЭТАПЕ ОТКЛЮЧЕНЫ. Возвращают 501 с пояснением. Реальная авторизация
// агента (pairing token, подпись heartbeat) будет реализована на следующем этапе.
// Причина: без проверки открывать writeable endpoints небезопасно.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse } from "@/server/api-helpers.server";

function disabled(msg: string) {
  return jsonResponse({
    error: "agent_protocol_not_enabled",
    message: msg,
    note: "Dev-этап: реальный Browser Agent подключается следующим этапом. API ATI не используется.",
  }, { status: 501 });
}

export const Route = createFileRoute("/api/public/agent/ai-dispatcher/$")({
  server: {
    handlers: {
      GET: async ({ params }) => disabled(`GET ${params._splat} disabled on dev`),
      POST: async ({ params }) => disabled(`POST ${params._splat} disabled on dev`),
    },
  },
});
