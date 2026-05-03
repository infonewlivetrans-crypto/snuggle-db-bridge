import { supabase } from "@/integrations/supabase/client";

const DEFAULT_TIMEOUT_MS = 5000;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Превышено время ожидания ответа сервера")), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiGet<T>(path: string, opts: { auth?: boolean; timeoutMs?: number } = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (opts.auth) Object.assign(headers, await authHeader());
  const res = await withTimeout(fetch(path, { headers, credentials: "same-origin" }), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
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
  const { profile } = await apiGet<{ profile: ProfileDTO | null }>("/api/profile", {
    auth: true,
    timeoutMs: 5000,
  });
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
  const { settings } = await apiGet<{ settings: T[] }>("/api/system-settings", {
    timeoutMs: 5000,
  });
  return settings;
}
