import { createFileRoute } from "@tanstack/react-router";
import { activateInvite, getInviteInfo } from "@/server/invites.server";
import { setSessionCookies } from "@/server/auth-cookies.server";

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

export const Route = createFileRoute("/api/invite-login")({
  server: {
    handlers: {
      // GET /api/invite-login?token=... — данные приглашения для формы активации
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = (url.searchParams.get("token") ?? "").trim();
        if (!token) return json({ error: "Не передан токен" }, { status: 400 });
        try {
          const info = await getInviteInfo(token);
          if (!info) return json({ error: "Ссылка недействительна" }, { status: 404 });
          return json({
            full_name: info.fullName,
            role: info.role,
            already_activated: info.alreadyActivated,
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Ссылка недействительна";
          return json({ error: message }, { status: 401 });
        }
      },
      // POST /api/invite-login { token, email, password, phone } — активация
      POST: async ({ request }) => {
        let body: { token?: string; email?: string; password?: string; phone?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return json({ error: "Некорректный запрос" }, { status: 400 });
        }
        try {
          const session = await activateInvite({
            token: body?.token ?? "",
            email: body?.email ?? "",
            password: body?.password ?? "",
            phone: body?.phone ?? "",
          });
          setSessionCookies({
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
          });
          return json({
            ok: true,
            user_id: session.userId,
            role: session.role,
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Не удалось активировать ссылку";
          console.error("[invite-login] failed", e);
          return json({ error: message }, { status: 401 });
        }
      },
    },
  },
});
