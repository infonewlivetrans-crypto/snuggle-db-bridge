// Публичный endpoint активации диспетчера по invite-ссылке.
// Не использует service_role: всё через RPC (SECURITY DEFINER) на стороне БД
// плюс штатный supabase.auth.signUp от анонимного клиента.

import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, makeAnonClient } from "@/server/api-helpers.server";

type PublicInfo = {
  full_name: string;
  email: string | null;
  is_active: boolean;
  already_activated: boolean;
};

export const Route = createFileRoute("/api/public/dispatcher-user-invite/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = String(params.token || "").trim();
        if (!token) return jsonResponse({ ok: false, reason: "missing_token" }, { status: 400 });
        const anon = makeAnonClient();
        const { data, error } = await anon.rpc("get_dispatcher_user_invite_public" as never, {
          p_token: token,
        } as never);
        if (error) return jsonResponse({ ok: false, reason: error.message }, { status: 400 });
        const row = (Array.isArray(data) ? data[0] : data) as PublicInfo | null;
        if (!row) return jsonResponse({ ok: false, reason: "not_found" }, { status: 404 });
        if (!row.is_active && !row.already_activated)
          return jsonResponse({ ok: false, reason: "disabled" }, { status: 410 });
        if (row.already_activated)
          return jsonResponse({ ok: false, reason: "already_activated" }, { status: 409 });
        return jsonResponse({ ok: true, full_name: row.full_name, email: row.email });
      },

      POST: async ({ request, params }) => {
        const token = String(params.token || "").trim();
        if (!token) return jsonResponse({ ok: false, reason: "missing_token" }, { status: 400 });
        let body: { email?: string; password?: string };
        try {
          body = (await request.json()) as { email?: string; password?: string };
        } catch {
          return jsonResponse({ ok: false, reason: "bad_json" }, { status: 400 });
        }
        const email = (body.email ?? "").trim().toLowerCase();
        const password = body.password ?? "";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          return jsonResponse({ ok: false, reason: "bad_email" }, { status: 400 });
        if (password.length < 6)
          return jsonResponse({ ok: false, reason: "weak_password" }, { status: 400 });

        const anon = makeAnonClient();

        // 1) Проверяем, что приглашение ещё валидно (защита от гонок).
        const { data: pubData, error: pubErr } = await anon.rpc(
          "get_dispatcher_user_invite_public" as never,
          { p_token: token } as never,
        );
        if (pubErr)
          return jsonResponse({ ok: false, reason: pubErr.message }, { status: 400 });
        const pub = (Array.isArray(pubData) ? pubData[0] : pubData) as PublicInfo | null;
        if (!pub) return jsonResponse({ ok: false, reason: "not_found" }, { status: 404 });
        if (pub.already_activated)
          return jsonResponse({ ok: false, reason: "already_activated" }, { status: 409 });
        if (!pub.is_active)
          return jsonResponse({ ok: false, reason: "disabled" }, { status: 410 });

        // 2) Штатная регистрация пользователя.
        const { data: signUp, error: signUpErr } = await anon.auth.signUp({
          email,
          password,
        });
        if (signUpErr) {
          const m = signUpErr.message || "";
          if (/already|registered|exists/i.test(m))
            return jsonResponse({ ok: false, reason: "email_taken" }, { status: 409 });
          return jsonResponse({ ok: false, reason: m }, { status: 400 });
        }
        const newUserId = signUp.user?.id;
        if (!newUserId)
          return jsonResponse({ ok: false, reason: "signup_no_user" }, { status: 500 });

        // 3) Если Confirm Email включён, session не выдают сразу.
        let session = signUp.session;
        if (!session) {
          const { data: si } = await anon.auth.signInWithPassword({ email, password });
          session = si?.session ?? null;
        }

        // 4) Привязываем приглашение к пользователю + выдаём роль dispatcher (через SECURITY DEFINER).
        const { error: bindErr } = await anon.rpc(
          "bind_dispatcher_invite_to_user" as never,
          { p_token: token, p_user_id: newUserId, p_email: email } as never,
        );
        if (bindErr) {
          try {
            await anon.auth.signOut();
          } catch {
            /* noop */
          }
          return jsonResponse({ ok: false, reason: bindErr.message }, { status: 400 });
        }

        return jsonResponse({
          ok: true,
          user_id: newUserId,
          access_token: session?.access_token ?? null,
          refresh_token: session?.refresh_token ?? null,
        });
      },
    },
  },
});
