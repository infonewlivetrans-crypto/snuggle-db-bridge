import { createFileRoute } from "@tanstack/react-router";
import {
  jsonResponse,
  makeAdminClient,
  requireAnyRole,
} from "@/server/api-helpers.server";

// GET /api/dispatcher/carrier-link/users?search=<email|name|phone>
// Возвращает пользователей с ролью `carrier` для выбора в диалоге привязки.
// Доступно admin/dispatcher.

export const Route = createFileRoute("/api/dispatcher/carrier-link/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const search = (url.searchParams.get("search") ?? "").trim();
        const admin = makeAdminClient();

        // 1) Берём все user_id с ролью carrier
        const { data: roles } = await admin
          .from("user_roles")
          .select("user_id")
          .eq("role", "carrier" as never);
        const userIds = Array.from(
          new Set((roles ?? []).map((r: { user_id: string }) => r.user_id)),
        );
        if (userIds.length === 0) return jsonResponse({ rows: [] });

        // 2) Подтягиваем профили
        let q = admin
          .from("profiles")
          .select("user_id, full_name, email, phone")
          .in("user_id", userIds)
          .limit(50);
        if (search.length > 0) {
          const like = `%${search}%`;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          q = (q as any).or(
            `full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`,
          );
        }
        const { data: profiles, error } = await q;
        if (error) return jsonResponse({ error: error.message }, { status: 500 });

        // 3) Уже привязанные user_id — чтобы в UI отметить
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: links } = await (admin.from("dispatcher_carrier_users" as never) as any)
          .select("user_id, dispatcher_carrier_ext_id")
          .eq("status", "active")
          .in("user_id", userIds);
        const linkedMap: Record<string, string> = {};
        for (const l of (links ?? []) as Array<{ user_id: string; dispatcher_carrier_ext_id: string }>) {
          linkedMap[l.user_id] = l.dispatcher_carrier_ext_id;
        }
        const rows = (profiles ?? []).map(
          (p: { user_id: string; full_name: string | null; email: string | null; phone: string | null }) => ({
            ...p,
            linked_ext_id: linkedMap[p.user_id] ?? null,
          }),
        );
        return jsonResponse({ rows });
      },
    },
  },
});
