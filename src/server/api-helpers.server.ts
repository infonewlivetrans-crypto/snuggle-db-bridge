import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getSessionUser } from "@/server/auth-cookies.server";

function getSupabaseUrl(): string {
  return (
    process.env.SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL ??
    ""
  );
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

export function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

export function getBearerToken(request: Request): string | null {
  const h = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!h || !h.startsWith("Bearer ")) return null;
  const t = h.slice(7).trim();
  return t || null;
}

export function makeUserClient(token: string): SupabaseClient<Database> {
  return createClient<Database>(getSupabaseUrl(), getSupabasePublishableKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export function makeAnonClient(): SupabaseClient<Database> {
  return createClient<Database>(getSupabaseUrl(), getSupabasePublishableKey(), {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export async function requireUser(
  token: string,
): Promise<{ userId: string; client: SupabaseClient<Database> } | null> {
  const client = makeUserClient(token);
  try {
    const { data, error } = await client.auth.getClaims(token);
    if (error || !data?.claims?.sub) return null;
    return { userId: data.claims.sub as string, client };
  } catch {
    // expired/invalid JWT — treat as unauthenticated, не валим 500
    return null;
  }
}

/** Проверяет, что текущий пользователь — админ (RLS-клиент). */
export async function isAdmin(client: SupabaseClient<Database>, userId: string): Promise<boolean> {
  const { data, error } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

/** Проверяет, что у пользователя есть хотя бы одна из указанных ролей. */
export async function hasAnyRole(
  client: SupabaseClient<Database>,
  userId: string,
  roles: string[],
): Promise<boolean> {
  const { data } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", roles as never[]);
  return (data ?? []).length > 0;
}

/** Возвращает auth-контекст и проверяет, что пользователь имеет одну из ролей. */
export async function requireAnyRole(
  request: Request,
  roles: string[],
): Promise<{ userId: string; client: SupabaseClient<Database> } | Response> {
  const auth = await resolveAuth(request);
  if (!auth) return jsonResponse({ error: "unauthorized" }, { status: 401 });
  if (!(await hasAnyRole(auth.client, auth.userId, roles)))
    return jsonResponse({ error: "forbidden" }, { status: 403 });
  return auth;
}

/** Возвращает auth-контекст и проверяет, что пользователь — админ. */
export async function requireAdmin(
  request: Request,
): Promise<{ userId: string; client: SupabaseClient<Database> } | Response> {
  const auth = await resolveAuth(request);
  if (!auth) return jsonResponse({ error: "unauthorized" }, { status: 401 });
  if (!(await isAdmin(auth.client, auth.userId)))
    return jsonResponse({ error: "forbidden" }, { status: 403 });
  return auth;
}

/**
 * Универсальная аутентификация: сначала httpOnly cookie, затем Bearer-заголовок
 * (legacy для существующих вызовов с access_token).
 */
export async function resolveAuth(
  request: Request,
): Promise<{ userId: string; client: SupabaseClient<Database> } | null> {
  const cookieAuth = await getSessionUser();
  if (cookieAuth) return cookieAuth;
  const token = getBearerToken(request);
  if (!token) return null;
  return requireUser(token);
}

export async function requireAuth(
  request: Request,
): Promise<{ userId: string; client: SupabaseClient<Database> } | Response> {
  const auth = await resolveAuth(request);
  if (!auth) return jsonResponse({ error: "unauthorized" }, { status: 401 });
  return auth;
}

/**
 * Парсит ?limit=&offset=&search= из URL запроса.
 * limit ограничен 1..100, по умолчанию 20.
 */
export function parseListParams(request: Request): {
  limit: number;
  offset: number;
  search: string;
  url: URL;
} {
  const url = new URL(request.url);
  const limit = Math.min(
    Math.max(1, Number(url.searchParams.get("limit")) || 20),
    100,
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const search = (url.searchParams.get("search") ?? "").trim();
  return { limit, offset, search, url };
}

/**
 * Отдаёт ответ с заголовком приватного кеша на N секунд (для авторизованных
 * списков). Браузер положит ответ в HTTP-кеш — Realtime/мутации уже
 * инвалидируют React Query, так что фронт получит свежие данные при
 * необходимости.
 */
export function cacheHeaders(seconds: number, isPublic = false): HeadersInit {
  return {
    "cache-control": `${isPublic ? "public" : "private"}, max-age=${seconds}`,
  };
}
