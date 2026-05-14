import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAdmin } from "@/server/api-helpers.server";
import { importManagers, type ManagerImportItem } from "@/server/managers.server";
import { adminCreateInvite, adminListInvites } from "@/server/invites.server";

export const Route = createFileRoute("/api/managers/import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;
        try {
          const body = (await request.json()) as { items?: ManagerImportItem[] };
          if (!body || !Array.isArray(body.items)) return jsonResponse({ error: "Ожидался список менеджеров" }, { status: 400 });
          if (body.items.length === 0) return jsonResponse({ error: "Список пуст" }, { status: 400 });
          if (body.items.length > 5000) return jsonResponse({ error: "Слишком много строк (макс 5000)" }, { status: 400 });

          const result = await importManagers(body.items, auth.userId);
          const allInvites = await adminListInvites();
          const haveInviteByName = new Set(
            allInvites.filter((i) => i.role === "manager" && i.is_active).map((i) => (i.manager_name ?? i.full_name).toLowerCase().trim()),
          );
          let invitesCreated = 0;
          for (const it of result.items) {
            if (it.action !== "inserted") continue;
            const key = it.fullName.toLowerCase().trim();
            if (haveInviteByName.has(key)) continue;
            try {
              await adminCreateInvite({ fullName: it.fullName, phone: it.phone, role: "manager", managerName: it.fullName, createdBy: auth.userId });
              invitesCreated += 1;
            } catch (e) {
              console.error("[api/managers/import] invite create failed", it.fullName, e);
            }
          }
          return jsonResponse({ ...result, invitesCreated });
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});