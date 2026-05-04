// Серверные утилиты для работы с auth-сессией через httpOnly cookies.
// Клиент НЕ знает access/refresh токенов — они хранятся только в cookie.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  getCookie,
  setCookie,
  deleteCookie,
} from "@tanstack/react-start/server";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "";

export const ACCESS_COOKIE = "rt-access";
export const REFRESH_COOKIE = "rt-refresh";

const ACCESS_MAX_AGE = 60 * 60; // 1 час
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30; // 30 дней

export function setSessionCookies(args: {
  accessToken: string;
  refreshToken: string;
}) {
  // sameSite: "none" нужен, чтобы cookie сохранялись в iframe-превью (cross-site).
  // Secure обязателен при SameSite=None.
  const base = {
    httpOnly: true,
    secure: true,
    sameSite: "none" as const,
    path: "/",
  };
  setCookie(ACCESS_COOKIE, args.accessToken, { ...base, maxAge: ACCESS_MAX_AGE });
  setCookie(REFRESH_COOKIE, args.refreshToken, {
    ...base,
    maxAge: REFRESH_MAX_AGE,
  });
}

export function clearSessionCookies() {
  deleteCookie(ACCESS_COOKIE, { path: "/" });
  deleteCookie(REFRESH_COOKIE, { path: "/" });
}

function makeClient(token?: string): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: token
      ? { headers: { Authorization: `Bearer ${token}` } }
      : undefined,
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Возвращает аутентифицированного пользователя из cookie-сессии.
 * При истечении access токена пытается обновить через refresh и переустанавливает cookies.
 */
export async function getSessionUser(): Promise<
  { userId: string; client: SupabaseClient<Database> } | null
> {
  const access = getCookie(ACCESS_COOKIE);
  const refresh = getCookie(REFRESH_COOKIE);

  if (access) {
    const client = makeClient(access);
    const { data, error } = await client.auth.getClaims(access);
    if (!error && data?.claims?.sub) {
      return { userId: data.claims.sub as string, client };
    }
  }

  if (!refresh) return null;

  const refreshClient = makeClient();
  const { data: refreshData, error: refreshError } =
    await refreshClient.auth.refreshSession({ refresh_token: refresh });
  if (refreshError || !refreshData.session) {
    clearSessionCookies();
    return null;
  }

  setSessionCookies({
    accessToken: refreshData.session.access_token,
    refreshToken: refreshData.session.refresh_token,
  });

  const client = makeClient(refreshData.session.access_token);
  return { userId: refreshData.session.user.id, client };
}
