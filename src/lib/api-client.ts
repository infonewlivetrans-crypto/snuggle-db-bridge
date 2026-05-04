// Все запросы идут через cookie-сессию (httpOnly), без supabase.auth на клиенте.

const DEFAULT_TIMEOUT_MS = 5000;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error("Превышено время ожидания ответа сервера")),
      ms,
    );
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

async function apiFetch(
  path: string,
  opts: { auth?: boolean; timeoutMs?: number } = {},
): Promise<Response> {
  const headers: Record<string, string> = { accept: "application/json" };
  const res = await withTimeout(
    fetch(path, { headers, credentials: "same-origin" }),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  return res;
}

async function apiGet<T>(
  path: string,
  opts: { auth?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  const res = await apiFetch(path, opts);
  return (await res.json()) as T;
}

export interface ProfileDTO {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  is_active: boolean;
  carrier_id?: string | null;
}

export async function fetchProfileViaApi(): Promise<ProfileDTO | null> {
  const { profile } = await apiGet<{ profile: ProfileDTO | null }>(
    "/api/profile",
    { auth: true, timeoutMs: 5000 },
  );
  return profile;
}

export async function fetchUserRolesViaApi(): Promise<string[]> {
  const { roles } = await apiGet<{ roles: string[] }>("/api/user-role", {
    auth: true,
    timeoutMs: 5000,
  });
  return roles;
}

export async function fetchSystemSettingsViaApi<T = unknown>(): Promise<T[]> {
  const { settings } = await apiGet<{ settings: T[] }>(
    "/api/system-settings",
    { auth: false, timeoutMs: 5000 },
  );
  return settings;
}

// ─────────────────────────── Списки рабочих данных ──────────────────────────
export interface ListResult<T> {
  rows: T[];
  total: number;
}

export interface ListParams {
  limit?: number;
  offset?: number;
  search?: string;
  /** Доп. query-параметры (например status, type и т.п.) */
  extra?: Record<string, string | number | boolean | undefined>;
}

function buildQuery(p: ListParams): string {
  const q = new URLSearchParams();
  q.set("limit", String(p.limit ?? 20));
  q.set("offset", String(p.offset ?? 0));
  if (p.search) q.set("search", p.search);
  if (p.extra) {
    for (const [k, v] of Object.entries(p.extra)) {
      if (v === undefined || v === null || v === "" || v === "all") continue;
      q.set(k, String(v));
    }
  }
  return q.toString();
}

export async function fetchListViaApi<T>(
  path: string,
  params: ListParams = {},
  timeoutMs = 5000,
): Promise<ListResult<T>> {
  const res = await apiFetch(`${path}?${buildQuery(params)}`, {
    auth: true,
    timeoutMs,
  });
  const body = await res.json().catch(() => null);
  // Новый контракт: тело — массив, total приходит в X-Total-Count.
  if (Array.isArray(body)) {
    const totalHeader = res.headers.get("X-Total-Count");
    const total = totalHeader != null ? Number(totalHeader) : body.length;
    return { rows: body as T[], total: Number.isFinite(total) ? total : body.length };
  }
  // Обратная совместимость: { rows, total } от ещё не обновлённых эндпоинтов.
  if (body && typeof body === "object" && Array.isArray((body as { rows?: unknown }).rows)) {
    const b = body as { rows: T[]; total?: number };
    return { rows: b.rows, total: b.total ?? b.rows.length };
  }
  // Совместимость с ответами вида { data: [] }.
  if (body && typeof body === "object" && Array.isArray((body as { data?: unknown }).data)) {
    const b = body as { data: T[]; total?: number };
    return { rows: b.data, total: b.total ?? b.data.length };
  }
  console.error(`fetchListViaApi(${path}): неожиданный формат ответа`, body);
  return { rows: [], total: 0 };
}

/** Произвольный авторизованный GET с таймаутом — для одиночных ресурсов. */
export async function apiGetAuth<T>(
  path: string,
  timeoutMs = 5000,
): Promise<T> {
  return apiGet<T>(path, { auth: true, timeoutMs });
}

async function apiSend<T>(
  path: string,
  method: "POST" | "PATCH" | "DELETE" | "PUT",
  body?: unknown,
  opts: { timeoutMs?: number; raw?: boolean } = {},
): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: "same-origin",
    headers: { accept: "application/json" },
  };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    (init.headers as Record<string, string>)["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await withTimeout(fetch(path, init), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const text = await res.text();
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  if (!res.ok) {
    const msg =
      (parsed && typeof parsed === "object" && (parsed as { error?: string }).error) ||
      `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : `HTTP ${res.status}`);
  }
  return parsed as T;
}

export const apiPost = <T = unknown>(path: string, body?: unknown, timeoutMs?: number) =>
  apiSend<T>(path, "POST", body, { timeoutMs });
export const apiPatch = <T = unknown>(path: string, body?: unknown, timeoutMs?: number) =>
  apiSend<T>(path, "PATCH", body, { timeoutMs });
export const apiDelete = <T = unknown>(path: string, timeoutMs?: number) =>
  apiSend<T>(path, "DELETE", undefined, { timeoutMs });
