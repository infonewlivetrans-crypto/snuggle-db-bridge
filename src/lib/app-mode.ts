// Режим работы приложения.
//
// Хранится в system_settings.app.mode и читается через единый
// SettingsProvider-кэш, чтобы не делать отдельных запросов к API.
//
// - "radius_track" (по умолчанию) — полный режим Радиус Трек: все разделы.
// - "ai_dispatcher" — упрощённый режим AI-диспетчера. В меню показываются
//   только разделы подбора грузов; старые разделы скрыты, но НЕ удалены.

import { useSetting } from "@/lib/settings-provider";

export type AppMode = "radius_track" | "ai_dispatcher";

export function useAppMode(): AppMode {
  const value = useSetting<unknown>("app.mode", "radius_track");
  return value === "ai_dispatcher" ? "ai_dispatcher" : "radius_track";
}

export const APP_MODE_LABELS: Record<AppMode, string> = {
  radius_track: "Радиус Трек (полный режим)",
  ai_dispatcher: "AI-диспетчер (упрощённый режим)",
};

/** Префиксы маршрутов нового режима AI-диспетчера. */
export const DISPATCHER_ROUTE_PREFIXES: readonly string[] = ["/dispatcher"];

/** Служебные разделы, которые остаются доступными в любом режиме. */
const SERVICE_PREFIXES: readonly string[] = [
  "/notifications",
  "/workspace",
  "/feedback",
  "/admin",
  "/users",
  "/d/", // публичные ссылки водителя
];

/** Видим ли путь в текущем режиме приложения. */
export function isPathVisibleInAppMode(path: string, mode: AppMode): boolean {
  if (mode === "radius_track") return true;
  if (DISPATCHER_ROUTE_PREFIXES.some((p) => path === p || path.startsWith(p + "/") || path === p + "/")) {
    return true;
  }
  return SERVICE_PREFIXES.some((p) => path.startsWith(p));
}
