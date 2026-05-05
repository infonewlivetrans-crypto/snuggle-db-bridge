import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAdmin } from "@/server/api-helpers.server";
import {
  adminSetUserActive,
  adminSetUserRole,
  adminSetUserRoles,
} from "@/server/users.server";
import { APP_ROLES, type AppRole } from "@/lib/auth/roles";

const ROLE_SET = new Set<AppRole>(APP_ROLES);

export const Route = createFileRoute("/api/users/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;
        try {
          const body = (await request.json()) as {
            isActive?: boolean;
            role?: AppRole;
            roles?: AppRole[];
          };
          const userId = params.id;
          if (!userId) return jsonResponse({ error: "userId обязателен" }, { status: 400 });

          if (typeof body.isActive === "boolean") {
            await adminSetUserActive({ userId, isActive: body.isActive });
          }
          if (Array.isArray(body.roles)) {
            if (body.roles.length === 0) {
              return jsonResponse({ error: "Выберите хотя бы одну роль" }, { status: 400 });
            }
            for (const r of body.roles) {
              if (!ROLE_SET.has(r)) {
                return jsonResponse({ error: `Недопустимая роль: ${r}` }, { status: 400 });
              }
            }
            await adminSetUserRoles({ userId, roles: body.roles });
          } else if (body.role) {
            if (!ROLE_SET.has(body.role)) {
              return jsonResponse({ error: "Недопустимая роль" }, { status: 400 });
            }
            await adminSetUserRole({ userId, role: body.role });
          }
          return jsonResponse({ ok: true });
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
