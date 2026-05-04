import { createServerFn } from "@tanstack/react-start";
import { requireCookieAuth } from "@/server/auth-middleware.server";
import { assertCallerIsAdmin } from "./users.server";
import { importDrivers, type DriverImportItem } from "./drivers-import.server";
import { adminCreateInvite, adminListInvites } from "./invites.server";

export const importDriversFn = createServerFn({ method: "POST" })
  .middleware([requireCookieAuth])
  .inputValidator((input: { items: DriverImportItem[] }) => {
    if (!input || !Array.isArray(input.items)) throw new Error("Ожидался список водителей");
    if (input.items.length === 0) throw new Error("Список пуст");
    if (input.items.length > 5000) throw new Error("Слишком много строк (макс 5000)");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.userId);
    const { result, newDrivers } = await importDrivers(data.items);

    // Авто-создание инвайт-ссылок для всех новых водителей.
    const invites = await adminListInvites();
    const haveByDriverId = new Set(
      invites.filter((i) => i.role === "driver" && i.is_active && i.driver_id).map((i) => i.driver_id as string),
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
          createdBy: context.userId,
        });
        invitesCreated += 1;
      } catch (e) {
        console.error("[importDriversFn] invite create failed", d.fullName, e);
      }
    }
    return { ...result, invitesCreated };
  });
