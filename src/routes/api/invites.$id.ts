import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAdmin } from "@/server/api-helpers.server";
import { adminDeleteInvite, adminRotateInviteToken, adminSetInviteActive } from "@/server/invites.server";

export const Route = createFileRoute("/api/invites/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;
        try {
          if (!params.id) return jsonResponse({ error: "id обязателен" }, { status: 400 });
          const body = (await request.json().catch(() => ({}))) as { isActive?: boolean; rotate?: boolean };
          if (body?.rotate) {
            const row = await adminRotateInviteToken({ id: params.id });
            return jsonResponse(row);
          }
          if (typeof body?.isActive === "boolean") {
            await adminSetInviteActive({ id: params.id, isActive: body.isActive });
            return jsonResponse({ ok: true });
          }
          return jsonResponse({ error: "Нет изменений" }, { status: 400 });
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
      DELETE: async ({ request, params }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;
        try {
          if (!params.id) return jsonResponse({ error: "id обязателен" }, { status: 400 });
          await adminDeleteInvite({ id: params.id });
          return jsonResponse({ ok: true });
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
