import { apiGetAuth, apiPatch } from "@/lib/api-client";

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
  const { settings } = await apiGetAuth<{ settings: SystemSetting[] }>("/api/system-settings");
  return settings ?? [];
}

export async function fetchSetting(key: string): Promise<SystemSetting | null> {
  const all = await fetchAllSettings();
  return all.find((s) => s.setting_key === key) ?? null;
}

export async function updateSetting(id: string, value: SettingValue, description?: string) {
  const body: Record<string, unknown> = { setting_value: value };
  if (description !== undefined) body.description = description;
  await apiPatch(`/api/system-settings/${id}`, body);
}

export async function fetchAppVersion(platform: string = APP_CLIENT_PLATFORM): Promise<AppVersion | null> {
  try {
    const { version } = await apiGetAuth<{ version: AppVersion | null }>(
      `/api/app-versions?platform=${encodeURIComponent(platform)}`,
    );
    return version;
  } catch {
    return null;
  }
}

export async function fetchAllAppVersions(): Promise<AppVersion[]> {
  try {
    const { rows } = await apiGetAuth<{ rows: AppVersion[] }>("/api/app-versions");
    return rows ?? [];
  } catch {
    return [];
  }
}

export async function updateAppVersion(id: string, patch: Partial<AppVersion>) {
  await apiPatch(`/api/app-versions/${id}`, patch);
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
