import { createServerFn } from "@tanstack/react-start";
import { requireCookieAuth } from "@/server/auth-middleware";
import {
  adminCreateInvite,
  adminDeleteInvite,
  adminListInvites,
  adminRotateInviteToken,
  adminSetInviteActive,
  type InviteRole,
} from "./invites.server";
import { assertCallerIsAdmin } from "./users.server";

const ROLES: InviteRole[] = ["driver", "manager"];

export const listInvitesFn = createServerFn({ method: "GET" })
  .middleware([requireCookieAuth])
  .handler(async ({ context }) => {
    await assertCallerIsAdmin(context.userId);
    return adminListInvites();
  });

export const createInviteFn = createServerFn({ method: "POST" })
  .middleware([requireCookieAuth])
  .inputValidator(
    (input: {
      fullName: string;
      phone?: string | null;
      role: InviteRole;
      comment?: string | null;
      driverId?: string | null;
      managerName?: string | null;
    }) => {
      if (!input?.fullName?.trim()) throw new Error("Укажите ФИО");
      if (!ROLES.includes(input.role)) {
        throw new Error("Инвайт доступен только для водителя и менеджера");
      }
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.userId);
    return adminCreateInvite({ ...data, createdBy: context.userId });
  });

export const setInviteActiveFn = createServerFn({ method: "POST" })
  .middleware([requireCookieAuth])
  .inputValidator((input: { id: string; isActive: boolean }) => {
    if (!input?.id) throw new Error("id обязателен");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.userId);
    await adminSetInviteActive(data);
    return { ok: true };
  });

export const rotateInviteTokenFn = createServerFn({ method: "POST" })
  .middleware([requireCookieAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("id обязателен");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.userId);
    return adminRotateInviteToken(data);
  });

export const deleteInviteFn = createServerFn({ method: "POST" })
  .middleware([requireCookieAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("id обязателен");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.userId);
    await adminDeleteInvite(data);
    return { ok: true };
  });
