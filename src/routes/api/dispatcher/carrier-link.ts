import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  jsonResponse,
  makeAdminClient,
  requireAnyRole,
} from "@/server/api-helpers.server";

// GET    /api/dispatcher/carrier-link?ext_id=<dispatcher_carrier_ext.id>
//        → текущая активная связь с пользователем (если есть) + профиль
// POST   /api/dispatcher/carrier-link  { ext_id, user_id }
//        → создаёт active связь; деактивирует предыдущие active для этого user/ext
// DELETE /api/dispatcher/carrier-link  { ext_id }
//        → переводит активные связи этого ext в status='blocked'
//
// Доступно admin/dispatcher. service_role используется только серверно
// (через makeAdminClient внутри TanStack server route), не на клиенте.

const PostSchema = z.object({
  ext_id: z.string().uuid(),
  user_id: z.string().uuid(),
});
const DeleteSchema = z.object({ ext_id: z.string().uuid() });

export const Route = createFileRoute("/api/dispatcher/carrier-link")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const extId = url.searchParams.get("ext_id");
        if (!extId) return jsonResponse({ error: "ext_id required" }, { status: 400 });
        const admin = makeAdminClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: link } = await (admin.from("dispatcher_carrier_users" as never) as any)
          .select("id, user_id, status, created_at")
          .eq("dispatcher_carrier_ext_id", extId)
          .eq("status", "active")
          .maybeSingle();
        if (!link) return jsonResponse({ ok: true, link: null, profile: null });
        const { data: profile } = await admin
          .from("profiles")
          .select("user_id, full_name, email, phone")
          .eq("user_id", link.user_id)
          .maybeSingle();
        return jsonResponse({ ok: true, link, profile });
      },

      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        let body: unknown;
        try { body = await request.json(); } catch { return jsonResponse({ error: "invalid_json" }, { status: 400 }); }
        const parsed = PostSchema.safeParse(body);
        if (!parsed.success) {
          return jsonResponse({ error: "validation_failed", issues: parsed.error.issues }, { status: 400 });
        }
        const { ext_id, user_id } = parsed.data;
        const admin = makeAdminClient();

        // Проверяем, что ext-запись существует
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: ext } = await (admin.from("dispatcher_carrier_ext") as any)
          .select("id").eq("id", ext_id).maybeSingle();
        if (!ext) return jsonResponse({ error: "ext_not_found" }, { status: 404 });

        // Гасим предыдущие active записи для этого пользователя и этой ext-карточки
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin.from("dispatcher_carrier_users" as never) as any)
          .update({ status: "blocked" })
          .or(`user_id.eq.${user_id},dispatcher_carrier_ext_id.eq.${ext_id}`)
          .eq("status", "active");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (admin.from("dispatcher_carrier_users" as never) as any)
          .insert({
            dispatcher_carrier_ext_id: ext_id,
            user_id,
            status: "active",
            created_by: auth.userId,
          })
          .select("id, user_id, dispatcher_carrier_ext_id, status, created_at")
          .single();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });

        return jsonResponse({ ok: true, link: data });
      },

      DELETE: async ({ request }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const extId = url.searchParams.get("ext_id");
        const parsed = DeleteSchema.safeParse({ ext_id: extId });
        if (!parsed.success) {
          return jsonResponse({ error: "validation_failed", issues: parsed.error.issues }, { status: 400 });
        }
        const admin = makeAdminClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (admin.from("dispatcher_carrier_users" as never) as any)
          .update({ status: "blocked" })
          .eq("dispatcher_carrier_ext_id", parsed.data.ext_id)
          .eq("status", "active");
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
