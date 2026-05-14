// Серверные утилиты для работы с auth-сессией через httpOnly cookies.
// Клиент НЕ знает access/refresh токенов — они хранятся только в cookie
// (в production). В preview/dev cookie может не работать (iframe / cross-site),
// поэтому на клиенте предусмотрен Bearer-fallback из localStorage.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  getCookie,
  setCookie,
  deleteCookie,
  getRequestHost,
} from "@tanstack/react-start/server";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "";

export const ACCESS_COOKIE = "sb-access-token";
export const REFRESH_COOKIE = "sb-refresh-token";
const LEGACY_ACCESS_COOKIE = "rt-access";
const LEGACY_REFRESH_COOKIE = "rt-refresh";

const ACCESS_MAX_AGE = 60 * 60; // 1 час
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30; // 30 дней

/**
 * Возвращает параметры cookie в зависимости от окружения:
 *  - production-домен (radius-track.ru) → secure=true, sameSite=lax
 *  - preview/dev (lovableproject.com / localhost) → secure=true, sameSite=none
 *    (iframe требует SameSite=None; secure обязателен при None)
 *  - http-localhost → secure=false, sameSite=lax
 */
function cookieBaseOptions() {
  let host = "";
  try {
    host = getRequestHost() ?? "";
  } catch {
    host = "";
  }
  const isLocalhost = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const isProductionDomain = /(^|\.)radius-track\.ru$/i.test(host.split(":")[0]);

  if (isLocalhost) {
    return { httpOnly: true, secure: false, sameSite: "lax" as const, path: "/" };
  }
  if (isProductionDomain) {
    return { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };
  }
  // Lovable preview / любой другой HTTPS-iframe
  return { httpOnly: true, secure: true, sameSite: "none" as const, path: "/" };
}

export function setSessionCookies(args: {
  accessToken: string;
  refreshToken: string;
}) {
  const base = cookieBaseOptions();
  setCookie(ACCESS_COOKIE, args.accessToken, { ...base, maxAge: ACCESS_MAX_AGE });
  setCookie(REFRESH_COOKIE, args.refreshToken, {
    ...base,
    maxAge: REFRESH_MAX_AGE,
  });
}

export function clearSessionCookies() {
  deleteCookie(ACCESS_COOKIE, { path: "/" });
  deleteCookie(REFRESH_COOKIE, { path: "/" });
  deleteCookie(LEGACY_ACCESS_COOKIE, { path: "/" });
  deleteCookie(LEGACY_REFRESH_COOKIE, { path: "/" });
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
  const access = getCookie(ACCESS_COOKIE) ?? getCookie(LEGACY_ACCESS_COOKIE);
  const refresh = getCookie(REFRESH_COOKIE) ?? getCookie(LEGACY_REFRESH_COOKIE);

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
