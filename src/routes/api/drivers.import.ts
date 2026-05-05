import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAdmin } from "@/server/api-helpers.server";
import { importDrivers, type DriverImportItem } from "@/server/drivers-import.server";
import { adminCreateInvite, adminListInvites } from "@/server/invites.server";

export const Route = createFileRoute("/api/drivers/import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;
        try {
          const body = (await request.json()) as { items?: DriverImportItem[] };
          if (!body || !Array.isArray(body.items)) {
            return jsonResponse({ error: "Ожидался список водителей" }, { status: 400 });
          }
          if (body.items.length === 0) {
            return jsonResponse({ error: "Список пуст" }, { status: 400 });
          }
          if (body.items.length > 5000) {
            return jsonResponse({ error: "Слишком много строк (макс 5000)" }, { status: 400 });
          }
          const { result, newDrivers } = await importDrivers(body.items);

          const invites = await adminListInvites();
          const haveByDriverId = new Set(
            invites
              .filter((i) => i.role === "driver" && i.is_active && i.driver_id)
              .map((i) => i.driver_id as string),
          );
          let invitesCreated = 0;
          for (const d of newDrivers) {
            if (haveByDriverId.has(d.id)) continue;
            try {
              await adminCreateInvite({
                fullName: d.fullName,
                phone: d.phone,
                role: "driver",
                driverId: d.id,
                createdBy: auth.userId,
              });
              invitesCreated += 1;
            } catch (e) {
              console.error("[api/drivers/import] invite create failed", d.fullName, e);
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
