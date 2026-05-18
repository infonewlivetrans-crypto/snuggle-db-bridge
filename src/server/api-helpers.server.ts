import "@/server/env-bootstrap.server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getSessionUser } from "@/server/auth-cookies.server";

function getSupabaseUrl(): string {
  return (
    process.env.VITE_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    ""
  );
}
function getSupabasePublishableKey(): string {
  return (
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    ""
  );
}
function getSupabaseServiceRoleKey(): string {
  // ВНИМАНИЕ: admin client должен использовать СТРОГО service_role key.
  // Никаких fallback на ANON / PUBLISHABLE — иначе Supabase вернёт
  // "Invalid API key" при попытке выполнить операцию, требующую
  // service_role (например, bypass RLS при admin-delete).
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
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

function buildAdminClient(): SupabaseClient<Database> {
  const url = getSupabaseUrl();
  const serviceRoleKey = getSupabaseServiceRoleKey();
  if (!url) {
    throw new Error("Missing SUPABASE_URL for admin client");
  }
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for admin client");
  }
  // Защитная проверка: если по ошибке в env положили publishable/anon key
  // под именем SUPABASE_SERVICE_ROLE_KEY, Supabase вернёт "Invalid API key"
  // на любую admin-операцию. Ловим это раньше и с понятным сообщением.
  const publishable = getSupabasePublishableKey();
  if (publishable && serviceRoleKey === publishable) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY equals publishable/anon key — admin client cannot use a public key",
    );
  }
  return createClient<Database>(url, serviceRoleKey, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Возвращает ЛЕНИВЫЙ admin-клиент. Сам вызов `makeAdminClient()` не делает
 * никаких сетевых запросов и не падает, если env service_role не сконфигурирован.
 * Ошибка "Missing SUPABASE_URL/SERVICE_ROLE_KEY" возникает только при первой
 * реальной попытке обратиться к клиенту (например `.from(...)` / `.auth.admin`).
 *
 * Это позволяет публичным/пользовательским GET endpoint (которые сами admin не
 * используют, но через транзитивные импорты подтаскивают модули с
 * `const supabaseAdmin = makeAdminClient()` на верхнем уровне) не падать 500
 * при загрузке модуля на VPS без service_role.
 */
export function makeAdminClient(): SupabaseClient<Database> {
  let real: SupabaseClient<Database> | undefined;
  const getReal = () => (real ??= buildAdminClient());
  return new Proxy({} as SupabaseClient<Database>, {
    get(_t, prop, receiver) {
      return Reflect.get(getReal() as object, prop, receiver);
    },
    has(_t, prop) {
      return Reflect.has(getReal() as object, prop);
    },
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
