import { createFileRoute } from "@tanstack/react-router";
import { exchangeInviteToken } from "@/server/invites.server";

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

export const Route = createFileRoute("/api/invite-login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let token: string | null = null;
        try {
          const body = (await request.json()) as { token?: string };
          token = body?.token?.trim() ?? null;
        } catch {
          return json({ error: "Некорректный запрос" }, { status: 400 });
        }
        if (!token) return json({ error: "Не передан токен" }, { status: 400 });

        try {
          const session = await exchangeInviteToken(token);
          return json({
            access_token: session.accessToken,
            refresh_token: session.refreshToken,
            user_id: session.userId,
            role: session.role,
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Ссылка недействительна";
          console.error("[invite-login] failed", e);
          return json({ error: message }, { status: 401 });
        }
      },
    },
  },
});
