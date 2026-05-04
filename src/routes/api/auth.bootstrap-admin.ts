// POST /api/auth/bootstrap-admin — создаёт первого админа и сразу логинит его.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse } from "@/server/api-helpers.server";
import { bootstrapFirstAdmin } from "@/server/users.server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { setSessionCookies } from "@/server/auth-cookies.server";

export const Route = createFileRoute("/api/auth/bootstrap-admin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { email?: string; password?: string; fullName?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return jsonResponse({ error: "Некорректный запрос" }, { status: 400 });
        }
        const email = (body.email ?? "").trim();
        const password = body.password ?? "";
        const fullName = (body.fullName ?? "").trim();
        if (!email || !password || !fullName) {
          return jsonResponse({ error: "Заполните все поля" }, { status: 400 });
        }
        if (password.length < 6) {
          return jsonResponse(
            { error: "Пароль должен быть не короче 6 символов" },
            { status: 400 },
          );
        }
        try {
          await bootstrapFirstAdmin({ email, password, fullName });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Не удалось создать администратора";
          return jsonResponse({ error: message }, { status: 400 });
        }
        const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
        const key =
          process.env.SUPABASE_PUBLISHABLE_KEY ??
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        if (!url || !key) {
          return jsonResponse({ error: "Сервер не настроен" }, { status: 500 });
        }
        const sb = createClient<Database>(url, key, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error || !data.session) {
          return jsonResponse(
            { error: "Администратор создан, но войти не удалось" },
            { status: 500 },
          );
        }
        setSessionCookies({
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
        });
        return jsonResponse({ ok: true, user_id: data.user?.id ?? null });
      },
    },
  },
});
