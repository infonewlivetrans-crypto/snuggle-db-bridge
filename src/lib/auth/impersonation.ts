// Управление состоянием имперсонации: только в sessionStorage,
// JWT и Supabase-сессия НЕ подменяются. Это чисто клиентский overlay.
import type { AppRole } from "./roles";

export type ImpersonationProfile = {
  id?: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  is_active?: boolean;
  carrier_id?: string | null;
};

export type ImpersonationState = {
  targetUserId: string;
  profile: ImpersonationProfile;
  roles: AppRole[];
  startedAt: string;
  // Кто инициировал (admin user id) — для проверки на отмену
  initiatedBy: string;
};

const STORAGE_KEY = "rt-impersonation-v1";

export function loadImpersonation(): ImpersonationState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ImpersonationState;
    if (!parsed?.targetUserId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveImpersonation(state: ImpersonationState) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearImpersonation() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}

export function isImpersonationActive(): boolean {
  return !!loadImpersonation();
}

/**
 * Глобальный read-only guard: в режиме имперсонации блокируем
 * любые не-GET/HEAD/OPTIONS запросы к /api/* (кроме stop-функции).
 * Это не подменяет авторизацию, а защищает от случайных мутаций.
 */
let installed = false;
export function installImpersonationFetchGuard(onBlocked?: (url: string, method: string) => void) {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isImpersonationActive()) return orig(input, init);
    const method = (init?.method || (typeof input !== "string" && "method" in (input as Request)
      ? (input as Request).method
      : "GET")).toUpperCase();
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;

    const isReadOnly = method === "GET" || method === "HEAD" || method === "OPTIONS";
    // Разрешаем серверные функции остановки имперсонации
    const isStopCall = url.includes("stopImpersonationFn") || url.includes("/api/auth/logout");
    // Разрешаем offline photo flush — но он тоже мутирует. Лучше блокировать.
    if (isReadOnly || isStopCall) return orig(input, init);

    onBlocked?.(url, method);
    return new Response(
      JSON.stringify({ error: "Действие недоступно в режиме «Войти как пользователь» (read-only)" }),
      { status: 403, headers: { "content-type": "application/json" } },
    );
  };
}
