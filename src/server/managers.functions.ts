import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCallerIsAdmin } from "./users.server";
import {
  createManager,
  deleteManager,
  importManagers,
  listManagers,
  updateManager,
  type ManagerImportItem,
} from "./managers.server";
import { importCarriers, type CarrierImportItem } from "./carriers-import.server";

export const listManagersFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCallerIsAdmin(context.userId);
    return listManagers();
  });

export const importManagersFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { items: ManagerImportItem[] }) => {
    if (!input || !Array.isArray(input.items)) {
      throw new Error("Ожидался список менеджеров");
    }
    if (input.items.length === 0) throw new Error("Список пуст");
    if (input.items.length > 5000) throw new Error("Слишком много строк (макс 5000)");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.userId);
    const result = await importManagers(data.items, context.userId);

    // После импорта — автоматически создаём инвайт-ссылки для всех новых менеджеров,
    // у которых ещё нет активного инвайта. Чтобы запись сразу появилась в /users.
    const { adminCreateInvite, adminListInvites } = await import("./invites.server");
    const allInvites = await adminListInvites();
    const haveInviteByName = new Set(
      allInvites
        .filter((i) => i.role === "manager" && i.is_active)
        .map((i) => (i.manager_name ?? i.full_name).toLowerCase().trim()),
    );
    let invitesCreated = 0;
    for (const it of result.items) {
      if (it.action !== "inserted") continue;
      const key = it.fullName.toLowerCase().trim();
      if (haveInviteByName.has(key)) continue;
      try {
        await adminCreateInvite({
          fullName: it.fullName,
          phone: it.phone,
          role: "manager",
          managerName: it.fullName,
          createdBy: context.userId,
        });
        invitesCreated += 1;
      } catch (e) {
        console.error("[importManagersFn] invite create failed", it.fullName, e);
      }
    }
    return { ...result, invitesCreated };
  });

export const createManagerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fullName: string; phone?: string | null; comment?: string | null }) => {
    if (!input?.fullName?.trim()) throw new Error("Укажите ФИО");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.userId);
    return createManager({ ...data, createdBy: context.userId });
  });

export const updateManagerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id: string;
      patch: Partial<{
        full_name: string;
        phone: string | null;
        comment: string | null;
        is_active: boolean;
        status: "active" | "needs_review" | "disabled";
      }>;
    }) => {
      if (!input?.id) throw new Error("id обязателен");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.userId);
    await updateManager(data);
    return { ok: true };
  });

export const deleteManagerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("id обязателен");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.userId);
    await deleteManager(data.id);
    return { ok: true };
  });

export const importCarriersFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { items: CarrierImportItem[] }) => {
    if (!input || !Array.isArray(input.items)) throw new Error("Ожидался список");
    if (input.items.length === 0) throw new Error("Список пуст");
    if (input.items.length > 5000) throw new Error("Слишком много строк (макс 5000)");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.userId);
    return importCarriers(data.items);
  });
