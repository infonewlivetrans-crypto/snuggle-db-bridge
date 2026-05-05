import { createFileRoute } from "@tanstack/react-router";
import { cacheHeaders, jsonResponse, requireAdmin } from "@/server/api-helpers.server";
import { adminCreateUser, adminListUsers } from "@/server/users.server";
import { adminCreateInvite, type InviteRole } from "@/server/invites.server";
import { APP_ROLES, type AppRole } from "@/lib/auth/roles";
import { inviteUrl } from "@/lib/invite-url";

const INVITE_ROLES = new Set<InviteRole>(["admin", "logist", "manager", "driver"]);

const ROLE_SET = new Set<AppRole>(APP_ROLES);

export const Route = createFileRoute("/api/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) {
          return jsonResponse([], { status: auth.status, headers: { "X-Error": "unauthorized" } });
        }
        try {
          const url = new URL(request.url);
          const limit = Math.min(
            Math.max(1, Number(url.searchParams.get("limit")) || 20),
            100,
          );
          const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
          const all = await adminListUsers();
          const arr = Array.isArray(all) ? all : [];
          const rows = arr.slice(offset, offset + limit);
          return jsonResponse(rows, {
            headers: { ...cacheHeaders(60), "X-Total-Count": String(arr.length) },
          });
        } catch (e) {
          return jsonResponse([], {
            status: 500,
            headers: { "X-Error": (e as Error).message },
          });
        }
      },
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;
        try {
          const body = (await request.json()) as {
            email?: string;
            password?: string;
            fullName?: string;
            role?: AppRole;
          };
          if (!body?.email || !body?.password || !body?.fullName) {
            return jsonResponse({ error: "Заполните все поля" }, { status: 400 });
          }
          if (body.password.length < 6) {
            return jsonResponse({ error: "Пароль должен быть не короче 6 символов" }, { status: 400 });
          }
          if (!body.role || !ROLE_SET.has(body.role)) {
            return jsonResponse({ error: "Недопустимая роль" }, { status: 400 });
          }
          const result = await adminCreateUser({
            email: body.email,
            password: body.password,
            fullName: body.fullName,
            role: body.role,
          });
          return jsonResponse(result);
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
