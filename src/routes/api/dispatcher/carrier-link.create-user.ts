import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  jsonResponse,
  makeAdminClient,
  requireAnyRole,
} from "@/server/api-helpers.server";

// POST /api/dispatcher/carrier-link/create-user
// Body: { ext_id, full_name, email, phone, password }
// Создаёт auth user, profile, выдаёт роль carrier и (по умолчанию)
// привязывает к dispatcher_carrier_ext через dispatcher_carrier_users.
//
// Доступ: admin/dispatcher. Использует service_role (admin client) серверно.
// При невалидном service_role на VPS возвращается понятная ошибка, а не
// сырое "Invalid API key" от Supabase.

const Schema = z.object({
  ext_id: z.string().uuid(),
  full_name: z.string().trim().min(1).max(255),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(3).max(64).optional().nullable(),
  password: z.string().min(6).max(128),
  link: z.boolean().optional().default(true),
});

function adminUnavailable(detail: string): Response {
  return jsonResponse(
    {
      error: "admin_unavailable",
      detail:
        "Создание пользователя недоступно из-за серверной настройки. Используйте существующего пользователя или настройте безопасную RPC.",
      reason: detail,
    },
    { status: 503 },
  );
}

export const Route = createFileRoute(
  "/api/dispatcher/carrier-link/create-user",
)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "invalid_json" }, { status: 400 });
        }
        const parsed = Schema.safeParse(body);
        if (!parsed.success) {
          return jsonResponse(
            { error: "validation_failed", issues: parsed.error.issues },
            { status: 400 },
          );
        }
        const { ext_id, full_name, email, phone, password, link } = parsed.data;

        let admin;
        try {
          admin = makeAdminClient();
        } catch (e) {
          return adminUnavailable(e instanceof Error ? e.message : "no_admin");
        }

        // Проверяем, что ext-запись существует
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const extRes = await (admin.from("dispatcher_carrier_ext") as any)
          .select("id")
          .eq("id", ext_id)
          .maybeSingle();
        if (extRes.error) {
          const msg = extRes.error.message ?? "";
          if (/invalid api key/i.test(msg)) return adminUnavailable(msg);
          return jsonResponse({ error: msg }, { status: 500 });
        }
        if (!extRes.data) {
          return jsonResponse({ error: "ext_not_found" }, { status: 404 });
        }

        // 1) Создаём auth user
        let newUserId: string;
        try {
          const { data, error } = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name, phone: phone ?? null },
          });
          if (error) {
            const msg = error.message ?? "";
            if (/invalid api key/i.test(msg)) return adminUnavailable(msg);
            if (/already (registered|been registered|exists)/i.test(msg)) {
              return jsonResponse(
                { error: "email_already_exists", detail: msg },
                { status: 409 },
              );
            }
            return jsonResponse({ error: msg }, { status: 500 });
          }
          newUserId = data.user!.id;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (/invalid api key/i.test(msg)) return adminUnavailable(msg);
          return jsonResponse({ error: msg }, { status: 500 });
        }

        // 2) Профиль (триггер обычно создаёт строку, но мы upsert-им поля)
        await admin
          .from("profiles")
          .upsert(
            {
              user_id: newUserId,
              email,
              full_name,
              phone: phone ?? null,
              is_active: true,
            } as never,
            { onConflict: "user_id" },
          );

        // 3) Роль carrier (idempotent: чистим прежние и ставим carrier)
        await admin.from("user_roles").delete().eq("user_id", newUserId);
        const roleRes = await admin
          .from("user_roles")
          .insert({ user_id: newUserId, role: "carrier" } as never);
        if (roleRes.error) {
          return jsonResponse(
            { error: roleRes.error.message },
            { status: 500 },
          );
        }

        // 4) Привязка к dispatcher_carrier_ext через dispatcher_carrier_users
        let linked = false;
        if (link) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (admin.from("dispatcher_carrier_users" as never) as any)
            .update({ status: "blocked" })
            .or(
              `user_id.eq.${newUserId},dispatcher_carrier_ext_id.eq.${ext_id}`,
            )
            .eq("status", "active");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const insRes = await (admin.from("dispatcher_carrier_users" as never) as any)
            .insert({
              dispatcher_carrier_ext_id: ext_id,
              user_id: newUserId,
              status: "active",
              created_by: auth.userId,
            })
            .select("id")
            .single();
          if (insRes.error) {
            return jsonResponse(
              { error: insRes.error.message, user_id: newUserId },
              { status: 500 },
            );
          }
          linked = true;
        }

        return jsonResponse({
          ok: true,
          user_id: newUserId,
          email,
          phone: phone ?? null,
          linked,
        });
      },
    },
  },
});
