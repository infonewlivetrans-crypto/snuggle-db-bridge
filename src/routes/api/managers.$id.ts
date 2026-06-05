import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAdmin } from "@/server/api-helpers.server";
import { deleteManager, updateManager } from "@/server/managers.server";

export const Route = createFileRoute("/api/managers/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;
        try {
          const body = (await request.json()) as { patch?: Record<string, unknown> };
          if (!params.id) return jsonResponse({ error: "id обязателен" }, { status: 400 });
          await updateManager({ id: params.id, patch: body.patch ?? {} });
          return jsonResponse({ ok: true });
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
      DELETE: async ({ request, params }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;
        try {
          if (!params.id) return jsonResponse({ error: "id обязателен" }, { status: 400 });
          await deleteManager(params.id);
          return jsonResponse({ ok: true });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[api/managers/:id DELETE] failed", { id: params.id, msg });
          if (/invalid api key|service[_ -]?role|JWT|unauthorized/i.test(msg)) {
            return jsonResponse(
              { error: "Удаление менеджера в этом режиме недоступно. Отключите менеджера вместо удаления." },
              { status: 501 },
            );
          }
          return jsonResponse({ error: "Не удалось удалить менеджера" }, { status: 500 });
        }
      },
    },
  },
});