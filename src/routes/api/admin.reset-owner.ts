// POST /api/admin/reset-owner
// Временный endpoint для безопасного сброса администратора.
// Авторизация — только по секретному RESET_TOKEN из переменных окружения.
// Передаётся в заголовке `x-reset-token` или в теле как { token }.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse } from "@/server/api-helpers.server";
import { makeAdminClient } from "@/server/api-helpers.server";
const supabaseAdmin = makeAdminClient();
import { clearSessionCookies } from "@/server/auth-cookies.server";

export const Route = createFileRoute("/api/admin/reset-owner")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.RESET_TOKEN;
        if (!expected) {
          return jsonResponse(
            { error: "RESET_TOKEN не настроен на сервере" },
            { status: 500 },
          );
        }
        let body: { token?: string } = {};
        try {
          body = (await request.json()) as { token?: string };
        } catch {
          /* allow empty body */
        }
        const provided =
          request.headers.get("x-reset-token") ?? body.token ?? "";
        if (provided !== expected) {
          return jsonResponse({ error: "Неверный токен сброса" }, { status: 401 });
        }

        const errors: string[] = [];
        const deletedAuth: string[] = [];

        try {
          // Найти всех админов
          const { data: admins, error: rolesErr } = await supabaseAdmin
            .from("user_roles")
            .select("user_id")
            .eq("role", "admin");
          if (rolesErr) {
            return jsonResponse({ error: rolesErr.message }, { status: 500 });
          }
          const adminIds = Array.from(
            new Set((admins ?? []).map((r) => r.user_id)),
          );

          for (const id of adminIds) {
            // Чистим связанные таблицы
            await supabaseAdmin.from("invite_tokens").delete().eq("user_id", id);
            await supabaseAdmin.from("user_roles").delete().eq("user_id", id);
            await supabaseAdmin.from("profiles").delete().eq("user_id", id);
            // Удаляем из Supabase Auth
            const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(id);
            if (delErr) errors.push(`${id}: ${delErr.message}`);
            else deletedAuth.push(id);
          }

          // На всякий случай: убрать оставшиеся записи с ролью admin
          await supabaseAdmin.from("user_roles").delete().eq("role", "admin");

          // Сбрасываем cookie текущей сессии, чтобы клиент попал на first-run
          clearSessionCookies();

          return jsonResponse({
            ok: true,
            deletedCount: deletedAuth.length,
            errors,
            message: "Можно зарегистрировать нового администратора",
          });
        } catch (e) {
          return jsonResponse(
            { error: e instanceof Error ? e.message : "Ошибка сброса" },
            { status: 500 },
          );
        }
      },
    },
  },
});
