import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { parseFreightText } from "@/server/freight/parse-text.server";

// POST /api/dispatcher/ai/parse-freight-text
// body: { text: string }
// Возвращает структурированные поля груза + точки маршрута + предупреждения.
// Сейчас — rule-based парсер на сервере. Архитектурно сюда позже можно
// подключить AI-провайдера (DeepSeek / OpenAI-совместимый), не меняя контракт.
// Никакие ключи AI не должны попадать в браузер: вся работа на сервере.

export const Route = createFileRoute("/api/dispatcher/ai/parse-freight-text")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ["dispatcher", "admin"]);
        if (auth instanceof Response) return auth;

        let body: { text?: unknown } = {};
        try {
          body = (await request.json()) as { text?: unknown };
        } catch {
          return jsonResponse({ error: "invalid_json" }, { status: 400 });
        }
        const text = typeof body.text === "string" ? body.text : "";
        if (!text.trim()) {
          return jsonResponse({ error: "empty_text" }, { status: 400 });
        }
        if (text.length > 10_000) {
          return jsonResponse({ error: "text_too_long" }, { status: 400 });
        }

        const parsed = parseFreightText(text);
        return jsonResponse({ ok: true, parsed });
      },
    },
  },
});
