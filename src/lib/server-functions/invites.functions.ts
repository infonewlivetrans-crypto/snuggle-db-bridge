import { createServerFn } from "@tanstack/react-start";
import {
  createInvite,
  deleteInvite,
  listInvites,
  rotateInviteToken,
  setInviteActive,
  type InviteRole,
} from "./invites.server";

const ROLES: InviteRole[] = ["driver", "manager"];

export type { InviteRole };

export const listInvitesFn = createServerFn({ method: "GET" }).handler(async () => {
  return listInvites();
});

export const createInviteFn = createServerFn({ method: "POST" })
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
  .handler(async ({ data }) => {
    return createInvite(data);
  });

export const setInviteActiveFn = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; isActive: boolean }) => {
    if (!input?.id) throw new Error("id обязателен");
    return input;
  })
  .handler(async ({ data }) => {
    return setInviteActive(data);
  });

export const rotateInviteTokenFn = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("id обязателен");
    return input;
  })
  .handler(async ({ data }) => {
    return rotateInviteToken(data);
  });

export const deleteInviteFn = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("id обязателен");
    return input;
  })
  .handler(async ({ data }) => {
    return deleteInvite(data);
  });