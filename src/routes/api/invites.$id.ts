import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAdmin } from "@/server/api-helpers.server";
import {
  adminDeleteInvite,
  adminRotateInviteToken,
  adminSetInviteActive,
} from "@/server/invites.server";

export const Route = createFileRoute("/api/invites/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;
        if (!params.id) {
          return jsonResponse({ error: "id обязателен" }, { status: 400 });
        }
        let body: { isActive?: boolean; rotate?: boolean } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          body = {};
        }
        try {
          if (body?.rotate) {
            const row = await adminRotateInviteToken({ id: params.id }, auth.client);
            return jsonResponse(row);
          }
          if (typeof body?.isActive === "boolean") {
            await adminSetInviteActive(
              { id: params.id, isActive: body.isActive },
              auth.client,
            );
            return jsonResponse({ ok: true });
          }
          return jsonResponse({ error: "Нет изменений" }, { status: 400 });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          // Ожидаемый бизнес-кейс: инвайт уже активирован — это не 500.
          if (/already activated/i.test(msg)) {
            return jsonResponse(
              { error: "Инвайт уже активирован. Используйте сброс пароля." },
              { status: 409 },
            );
          }
          if (/not found|does not exist/i.test(msg)) {
            return jsonResponse({ error: "Инвайт не найден" }, { status: 404 });
          }
          if (/disabled|blocked/i.test(msg)) {
            return jsonResponse({ error: "Инвайт отключён" }, { status: 409 });
          }
          console.error("[api/invites/:id PATCH] failed", { id: params.id, body, msg, error: e });
          return jsonResponse({ error: msg || "invite update failed" }, { status: 500 });
        }
      },
      DELETE: async ({ request, params }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;
        if (!params.id) {
          return jsonResponse({ error: "id обязателен" }, { status: 400 });
        }
        try {
          await adminDeleteInvite({ id: params.id }, auth.client);
          return jsonResponse({ ok: true });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (/already activated/i.test(msg)) {
            return jsonResponse(
              {
                error:
                  "Приглашение уже активировано. Чтобы закрыть доступ, отключите пользователя.",
              },
              { status: 409 },
            );
          }
          if (/not found|does not exist/i.test(msg)) {
            return jsonResponse({ error: "Инвайт не найден" }, { status: 404 });
          }
          console.error("[api/invites/:id DELETE] failed", { id: params.id, msg, error: e });
          return jsonResponse({ error: msg || "invite delete failed" }, { status: 500 });
        }
      },
    },
  },
});
