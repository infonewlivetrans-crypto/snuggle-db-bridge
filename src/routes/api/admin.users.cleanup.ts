import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAdmin } from "@/server/api-helpers.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/admin/users/cleanup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;
        const meId = auth.userId;
        try {
          // Список всех auth-пользователей
          const deletedAuth: string[] = [];
          const errors: string[] = [];
          let page = 1;
          // Постранично перебираем
          for (;;) {
            const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
            if (error) {
              return jsonResponse({ error: error.message }, { status: 500 });
            }
            const users = data?.users ?? [];
            for (const u of users) {
              if (u.id === meId) continue;
              const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(u.id);
              if (delErr) errors.push(`${u.id}: ${delErr.message}`);
              else deletedAuth.push(u.id);
            }
            if (users.length < 200) break;
            page += 1;
          }

          // Подчищаем профили / роли / приглашения, оставшиеся без auth-пользователя
          await supabaseAdmin.from("invite_tokens").delete().neq("user_id", meId);
          await supabaseAdmin.from("user_roles").delete().neq("user_id", meId);
          await supabaseAdmin.from("profiles").delete().neq("user_id", meId);

          return jsonResponse({
            ok: true,
            deletedCount: deletedAuth.length,
            keptUserId: meId,
            errors,
          });
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
