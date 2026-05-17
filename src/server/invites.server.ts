// Радиус Трек — Пакет 6.1: invite-flow без service_role на VPS и без
// ручных INSERT/UPDATE в auth.users / auth.identities.
//
// Архитектура:
//   • admin_issue_invite           — создание приглашения (только invite_tokens)
//   • admin_rotate_invite          — перевыпуск токена (только неактивированные)
//   • admin_set_invite_active      — вкл./откл. приглашение
//   • admin_delete_invite          — удаление (только неактивированные)
//   • get_invite_public            — публичные поля по токену (для страницы активации)
//   • validate_invite_for_activation — проверка перед регистрацией
//   • admin_bind_invite_to_user    — связывание свежезарегистрированного user
//                                    с приглашением (profiles + user_roles +
//                                    drivers/managers + activated_at)
//
// Все административные операции выполняются под bearer-токеном текущего
// пользователя (cookie-сессия или Authorization-заголовок). Активация
// использует штатный supabase.auth.signUp + signInWithPassword (anon-клиент).
//
// Confirm Email отключён в настройках Auth — signUp сразу возвращает session.

import "@/server/env-bootstrap.server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { normalizeRuPhone } from "@/lib/phone";
import { getRequest } from "@tanstack/react-start/server";
import { getSessionUser } from "@/server/auth-cookies.server";
import { makeAnonClient } from "@/server/api-helpers.server";

type DbClient = SupabaseClient<Database>;

export type InviteRole = "admin" | "logist" | "manager" | "driver";
const ALLOWED_INVITE_ROLES: InviteRole[] = ["admin", "logist", "manager", "driver"];

export type CreateInviteArgs = {
  fullName: string;
  phone?: string | null;
  role: InviteRole;
  comment?: string | null;
  driverId?: string | null;
  managerName?: string | null;
  createdBy?: string | null;
};

export type InviteRow = {
  id: string;
  token: string;
  user_id: string | null;
  full_name: string;
  phone: string | null;
  role: InviteRole;
  comment: string | null;
  driver_id: string | null;
  manager_id: string | null;
  manager_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  activated_at: string | null;
  activated_email: string | null;
};

function getSupabaseUrl(): string {
  return process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
}
function getSupabasePublishableKey(): string {
  return (
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY ??
    ""
  );
}

/**
 * Возвращает Supabase-клиент, действующий от имени текущего администратора
 * (cookie или Bearer). Все admin_*-RPC внутри Postgres проверяют auth.uid().
 */
async function getCallerSupabaseClient(): Promise<DbClient> {
  const session = await getSessionUser();
  if (session?.client) return session.client as DbClient;

  let token: string | null = null;
  try {
    const req = getRequest();
    const h =
      req?.headers?.get("authorization") ?? req?.headers?.get("Authorization");
    if (h?.startsWith("Bearer ")) token = h.slice(7).trim() || null;
  } catch {
    token = null;
  }
  if (!token) throw new Error("unauthorized");

  return createClient<Database>(getSupabaseUrl(), getSupabasePublishableKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

// ===== Admin operations =====

export async function adminCreateInvite(args: CreateInviteArgs): Promise<InviteRow> {
  if (!args.fullName?.trim()) throw new Error("Укажите ФИО");
  if (!ALLOWED_INVITE_ROLES.includes(args.role)) {
    throw new Error("Недопустимая роль для приглашения");
  }
  const phoneNorm = normalizeRuPhone(args.phone ?? null);
  const caller = await getCallerSupabaseClient();
  const { data, error } = await caller.rpc("admin_issue_invite", {
    p_full_name: args.fullName.trim(),
    p_phone: phoneNorm,
    p_role: args.role,
    p_comment: args.comment?.trim() || null,
    p_driver_id: args.driverId ?? null,
    p_manager_name: args.managerName?.trim() || null,
  } as never);
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Не удалось создать приглашение");
  return data as unknown as InviteRow;
}

export async function adminListInvites(client?: DbClient): Promise<InviteRow[]> {
  const c = client ?? (await getCallerSupabaseClient());
  const { data, error } = await c
    .from("invite_tokens")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as InviteRow[];
}

export async function adminSetInviteActive(args: { id: string; isActive: boolean }) {
  const caller = await getCallerSupabaseClient();
  const { error } = await caller.rpc("admin_set_invite_active", {
    p_invite_id: args.id,
    p_active: args.isActive,
  } as never);
  if (error) throw new Error(error.message);
}

export async function adminRotateInviteToken(args: { id: string }): Promise<InviteRow> {
  const caller = await getCallerSupabaseClient();
  const { data, error } = await caller.rpc("admin_rotate_invite", {
    p_invite_id: args.id,
  } as never);
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Не удалось перевыпустить ссылку");
  return data as unknown as InviteRow;
}

export async function adminDeleteInvite(args: { id: string }) {
  const caller = await getCallerSupabaseClient();
  const { error } = await caller.rpc("admin_delete_invite", {
    p_invite_id: args.id,
  } as never);
  if (error) throw new Error(error.message);
}

// ===== Public / activation flow =====

/** Публичные данные приглашения по токену (для страницы активации). */
export async function getInviteInfo(token: string): Promise<{
  fullName: string;
  role: InviteRole;
  alreadyActivated: boolean;
} | null> {
  if (!token || token.length < 8) return null;
  const anon = makeAnonClient();
  const { data, error } = await anon.rpc("get_invite_public", {
    p_token: token,
  } as never);
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  if (!row.is_active) throw new Error("Ссылка отключена администратором");
  return {
    fullName: row.full_name as string,
    role: row.role as InviteRole,
    alreadyActivated: Boolean(row.already_activated),
  };
}

/**
 * Активация приглашения штатной регистрацией пользователя.
 *
 * 1) validate_invite_for_activation — проверка токена.
 * 2) supabase.auth.signUp({ email, password }) — штатная регистрация
 *    (Confirm Email выключен → сразу session).
 * 3) admin_bind_invite_to_user — привязка пользователя к приглашению,
 *    создание profile + user_roles + связь с drivers/managers,
 *    проставление activated_at.
 *
 * При ошибке на шаге (3) пытаемся откатить локальную сессию через signOut,
 * чтобы клиент не оказался в полусостоянии.
 */
export async function activateInvite(args: {
  token: string;
  email: string;
  password: string;
  phone?: string;
  fullName?: string;
}): Promise<{
  accessToken: string;
  refreshToken: string;
  userId: string;
  role: InviteRole;
}> {
  const token = args.token?.trim();
  const email = args.email?.trim().toLowerCase();
  const password = args.password ?? "";
  const phoneRaw = (args.phone ?? "").trim();
  const fullNameRaw = (args.fullName ?? "").trim().replace(/\s+/g, " ");

  if (!token || token.length < 8) throw new Error("Некорректная ссылка");
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    throw new Error("Введите корректный email");
  if (password.length < 6) throw new Error("Пароль должен содержать минимум 6 символов");
  if (!phoneRaw) throw new Error("Введите номер телефона");
  const phoneNorm = normalizeRuPhone(phoneRaw);
  if (!phoneNorm) throw new Error("Введите корректный номер телефона");

  const anon = makeAnonClient();

  // 1) validate invite
  const { data: validation, error: vErr } = await anon.rpc(
    "validate_invite_for_activation",
    { p_token: token } as never,
  );
  if (vErr) {
    const m = vErr.message || "";
    if (/already activated/i.test(m)) throw new Error("Эта ссылка уже использовалась");
    if (/disabled/i.test(m)) throw new Error("Ссылка отключена администратором");
    if (/not found/i.test(m)) throw new Error("Ссылка недействительна");
    throw new Error(m || "Ссылка недействительна");
  }
  const v = (Array.isArray(validation) ? validation[0] : validation) as
    | { role: InviteRole }
    | null;
  if (!v) throw new Error("Ссылка недействительна");

  if (v.role === "manager") {
    if (!fullNameRaw) throw new Error("Введите полное ФИО");
    const parts = fullNameRaw.split(" ").filter((p) => p.length >= 2);
    if (parts.length < 2) throw new Error("Введите полное ФИО (минимум фамилия и имя)");
  }

  // 2) standard auth signUp
  const { data: signUp, error: signUpErr } = await anon.auth.signUp({
    email,
    password,
  });
  if (signUpErr) {
    const m = signUpErr.message || "";
    if (/already|registered|exists/i.test(m))
      throw new Error("Этот email уже занят. Используйте другой адрес.");
    throw new Error(m || "Не удалось зарегистрировать пользователя");
  }
  const newUserId = signUp.user?.id;
  if (!newUserId) throw new Error("Не удалось зарегистрировать пользователя");

  // С Confirm Email = off signUp возвращает session сразу.
  // Если по какой-то причине session нет — пробуем signIn, который сработает
  // при auto_confirm_email=true.
  let session = signUp.session;
  if (!session) {
    const { data: si, error: siErr } = await anon.auth.signInWithPassword({
      email,
      password,
    });
    if (siErr || !si.session) {
      throw new Error(
        "Регистрация прошла, но не удалось войти. Откройте страницу входа и войдите вручную.",
      );
    }
    session = si.session;
  }

  // 3) bind invite -> user
  const { error: bindErr } = await anon.rpc("admin_bind_invite_to_user", {
    p_token: token,
    p_user_id: newUserId,
    p_email: email,
    p_phone: phoneNorm,
    p_full_name: fullNameRaw || null,
  } as never);

  if (bindErr) {
    // Локальный rollback клиента — серверный auth-user остаётся,
    // следующая попытка с тем же email вернёт "уже занят" и админ при
    // необходимости перевыпустит ссылку / поменяет email.
    try {
      await anon.auth.signOut();
    } catch {
      /* noop */
    }
    throw new Error(bindErr.message || "Не удалось завершить активацию");
  }

  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    userId: newUserId,
    role: v.role,
  };
}

// ===== Helpers used elsewhere (route-import reuse) =====

/** Самый свежий активный и неактивированный driver-invite. */
export async function findReusableDriverInvite(
  driverId: string,
): Promise<InviteRow | null> {
  if (!driverId) return null;
  const caller = await getCallerSupabaseClient();
  const { data, error } = await caller
    .from("invite_tokens")
    .select("*")
    .eq("role", "driver")
    .eq("driver_id", driverId)
    .eq("is_active", true)
    .is("activated_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as InviteRow | null) ?? null;
}

/** Самый свежий активный и неактивированный manager-invite. */
export async function findReusableManagerInvite(
  managerId: string,
): Promise<InviteRow | null> {
  if (!managerId) return null;
  const caller = await getCallerSupabaseClient();
  const { data, error } = await caller
    .from("invite_tokens")
    .select("*")
    .eq("role", "manager")
    .eq("manager_id", managerId)
    .eq("is_active", true)
    .is("activated_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as InviteRow | null) ?? null;
}
