import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { jsonResponse } from "@/server/api-helpers.server";
import { setSessionCookies } from "@/server/auth-cookies.server";

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { email?: string; password?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return jsonResponse({ error: "Некорректный запрос" }, { status: 400 });
        }
        const email = (body.email ?? "").trim();
        const password = body.password ?? "";
        if (!email || !password) {
          return jsonResponse(
            { error: "Введите email и пароль" },
            { status: 400 },
          );
        }
        const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
        const key =
          process.env.SUPABASE_PUBLISHABLE_KEY ??
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        if (!url || !key) {
          return jsonResponse(
            { error: "Сервер не настроен" },
            { status: 500 },
          );
        }
        const sb = createClient<Database>(url, key, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            storage: undefined,
          },
        });
        const { data, error } = await sb.auth.signInWithPassword({
          email,
          password,
        });
        if (error || !data.session) {
          return jsonResponse(
            { error: "Неверный email или пароль" },
            { status: 401 },
          );
        }
        setSessionCookies({
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
        });
        // Возвращаем токены и в body — для Bearer-fallback в окружениях,
        // где httpOnly cookie не сохраняется (Lovable preview iframe и т.п.).
        return jsonResponse({
          ok: true,
          user_id: data.user?.id ?? null,
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_in: data.session.expires_in ?? 3600,
        });
      },
    },
  },
});
