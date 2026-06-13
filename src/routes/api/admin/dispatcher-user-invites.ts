// Admin API для приглашения новых пользователей-диспетчеров.
// Все операции выполняются под bearer/cookie текущего админа и проходят
// через SECURITY DEFINER RPC в БД (роль проверяется внутри RPC).
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

const ALLOWED_ROLES = ["admin"];

export const Route = createFileRoute("/api/admin/dispatcher-user-invites")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client.from("dispatcher_user_invites" as never) as any)
          .select(
            "id, token, full_name, email, comment, is_active, activated_at, activated_user_id, created_at, updated_at",
          )
          .order("created_at", { ascending: false });
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ rows: data ?? [] });
      },

      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        let body: { full_name?: string; email?: string | null; comment?: string | null };
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "bad_json" }, { status: 400 });
        }
        const fullName = (body.full_name ?? "").trim();
        if (!fullName) return jsonResponse({ error: "full_name_required" }, { status: 400 });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client as any).rpc(
          "admin_issue_dispatcher_user_invite",
          {
            p_full_name: fullName,
            p_email: body.email ?? null,
            p_comment: body.comment ?? null,
          },
        );
        if (error) return jsonResponse({ error: error.message }, { status: 400 });
        return jsonResponse({ row: data });
      },
    },
  },
});
