import { supabase } from "@/integrations/supabase/client";

export type SettingValue = unknown;

export interface SystemSetting {
  id: string;
  setting_key: string;
  setting_value: SettingValue;
  description: string | null;
  category: string;
  is_public: boolean;
  updated_at: string;
}

export interface AppVersion {
  id: string;
  platform: string;
  current_version: string;
  minimum_required_version: string;
  force_update: boolean;
  update_message: string | null;
  app_store_url: string | null;
  play_market_url: string | null;
  release_notes: string | null;
  released_at: string;
  updated_at: string;
}

/** Текущая версия web-клиента (синхронизируйте с релизами). */
export const APP_CLIENT_VERSION = "1.0.0";
export const APP_CLIENT_PLATFORM = "web";

export async function fetchAllSettings(): Promise<SystemSetting[]> {
  const { data, error } = await supabase
    .from("system_settings")
    .select("*")
    .order("category", { ascending: true })
    .order("setting_key", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SystemSetting[];
}

export async function fetchSetting(key: string): Promise<SystemSetting | null> {
  const { data, error } = await supabase
    .from("system_settings")
    .select("*")
    .eq("setting_key", key)
    .maybeSingle();
  if (error) throw error;
  return (data as SystemSetting | null) ?? null;
}

export async function updateSetting(id: string, value: SettingValue, description?: string) {
  const patch = { setting_value: value as never, ...(description !== undefined ? { description } : {}) };
  const { error } = await supabase.from("system_settings").update(patch).eq("id", id);
  if (error) throw error;
}

export async function fetchAppVersion(platform: string = APP_CLIENT_PLATFORM): Promise<AppVersion | null> {
  const { data, error } = await supabase
    .from("app_versions")
    .select("*")
    .eq("platform", platform)
    .maybeSingle();
  if (error) throw error;
  return (data as AppVersion | null) ?? null;
}

export async function fetchAllAppVersions(): Promise<AppVersion[]> {
  const { data, error } = await supabase
    .from("app_versions")
    .select("*")
    .order("platform", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AppVersion[];
}

export async function updateAppVersion(id: string, patch: Partial<AppVersion>) {
  const { error } = await supabase.from("app_versions").update(patch).eq("id", id);
  if (error) throw error;
}

/** Сравнение semver-подобных версий. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((x) => parseInt(x, 10) || 0);
  const pb = b.split(".").map((x) => parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

export type VersionCheckResult =
  | { status: "ok" }
  | { status: "update_available"; version: AppVersion }
  | { status: "force_update"; version: AppVersion };

export function checkVersion(version: AppVersion | null, client = APP_CLIENT_VERSION): VersionCheckResult {
  if (!version) return { status: "ok" };
  if (compareVersions(client, version.minimum_required_version) < 0 || version.force_update) {
    return { status: "force_update", version };
  }
  if (compareVersions(client, version.current_version) < 0) {
    return { status: "update_available", version };
  }
  return { status: "ok" };
}
