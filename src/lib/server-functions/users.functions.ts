import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  adminCreateUser,
  adminListUsers,
  adminSetUserActive,
  adminSetUserRole,
  assertCallerIsAdmin,
  bootstrapFirstAdmin,
  hasAnyAdmin,
} from "../../server/users.server";
import { APP_ROLES, type AppRole } from "@/lib/auth/roles";

const ROLE_SET = new Set<AppRole>(APP_ROLES);

export const hasAnyAdminFn = createServerFn({ method: "GET" }).handler(async () => {
  return { hasAdmin: await hasAnyAdmin() };
});

export const bootstrapFirstAdminFn = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string; password: string; fullName: string }) => {
    if (!input?.email || !input?.password || !input?.fullName) {
      throw new Error("Заполните все поля");
    }
    if (input.password.length < 6) throw new Error("Пароль должен быть не короче 6 символов");
    return input;
  })
  .handler(async ({ data }) => {
    return bootstrapFirstAdmin(data);
  });

export const listUsersFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCallerIsAdmin(context.userId);
    return adminListUsers();
  });

export const createUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; password: string; fullName: string; role: AppRole }) => {
    if (!input?.email || !input?.password || !input?.fullName) throw new Error("Заполните все поля");
    if (input.password.length < 6) throw new Error("Пароль должен быть не короче 6 символов");
    if (!ROLE_SET.has(input.role)) throw new Error("Недопустимая роль");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.userId);
    return adminCreateUser(data);
  });

export const setUserRoleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; role: AppRole }) => {
    if (!input?.userId) throw new Error("userId обязателен");
    if (!ROLE_SET.has(input.role)) throw new Error("Недопустимая роль");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.userId);
    await adminSetUserRole(data);
    return { ok: true };
  });

export const setUserActiveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; isActive: boolean }) => {
    if (!input?.userId) throw new Error("userId обязателен");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.userId);
    await adminSetUserActive(data);
    return { ok: true };
  });
