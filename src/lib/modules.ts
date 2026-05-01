import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ModuleKey =
  | "warehouse"
  | "supply"
  | "accounting"
  | "carriers"
  | "onec"
  | "excel_import";

export type EnabledModules = Record<ModuleKey, boolean>;

const DEFAULTS: EnabledModules = {
  warehouse: true,
  supply: true,
  accounting: true,
  carriers: true,
  onec: true,
  excel_import: true,
};

export const MODULE_LABELS: Record<ModuleKey, string> = {
  warehouse: "Склад",
  supply: "Снабжение",
  accounting: "Бухгалтерия",
  carriers: "Перевозчики",
  onec: "1С",
  excel_import: "Импорт Excel",
};

export const MODULE_DESCRIPTIONS: Record<ModuleKey, string> = {
  warehouse: "Складские операции, остатки, графики отгрузок",
  supply: "Снабжение и закупки",
  accounting: "Финансовые отчёты, расчёты и оплаты перевозчикам",
  carriers: "Внешние перевозчики, предложения рейсов",
  onec: "Интеграция с 1С",
  excel_import: "Импорт заказов из Excel",
};

/** Чтение настройки modules.enabled из system_settings (с дефолтами). */
export function useEnabledModules(): EnabledModules {
  const { data } = useQuery({
    queryKey: ["modules.enabled"],
    staleTime: 60_000,
    queryFn: async (): Promise<EnabledModules> => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("setting_value")
        .eq("setting_key", "modules.enabled")
        .maybeSingle();
      if (error) return DEFAULTS;
      const v = (data?.setting_value as Partial<EnabledModules> | null) ?? null;
      return { ...DEFAULTS, ...(v ?? {}) };
    },
  });
  return data ?? DEFAULTS;
}

/** Маппинг: какие пути относятся к каким модулям. Если модуль выключен — путь скрывается. */
export function pathBelongsToModule(path: string): ModuleKey | null {
  if (path.startsWith("/warehouse")) return "warehouse";
  if (path.startsWith("/supply")) return "supply";
  // Финансы перевозчикам — модуль «Бухгалтерия»
  if (path.startsWith("/carrier-payments")) return "accounting";
  // Всё остальное «перевозчицкое» — модуль «Перевозчики»
  if (
    path.startsWith("/carriers") ||
    path.startsWith("/carrier-offers") ||
    path.startsWith("/carrier-routes")
  ) {
    return "carriers";
  }
  if (path.startsWith("/data-import")) return "excel_import";
  return null;
}

export function isPathEnabled(path: string, modules: EnabledModules): boolean {
  const m = pathBelongsToModule(path);
  if (!m) return true;
  return modules[m];
}

// ===== Режим запуска =====

export type LaunchMode = "minimal" | "full";

/**
 * Пути, видимые в режиме «Минимальный запуск».
 * Только базовый сценарий: рабочий день, импорт, заказы, маршруты, водитель,
 * отчёты менеджеру, контроль работы. Плюс служебное (настройки, пользователи,
 * уведомления, выход).
 */
const MINIMAL_ALLOWED_PREFIXES: readonly string[] = [
  "/work-day",
  "/work-control",
  "/data-import",
  "/", // заказы (точное совпадение проверяем отдельно)
  "/orders",
  "/delivery-routes",
  "/routes",
  "/driver",
  "/route-reports",
  // Служебные — нужны для управления самим режимом и пользователями
  "/admin",
  "/users",
  "/notifications",
  "/feedback",
  "/d/",
  "/workspace",
];

/** Точные пути «Заказов» — корневой роут. */
function isOrdersPath(path: string): boolean {
  return path === "/" || path.startsWith("/?");
}

/** Видим ли путь в текущем режиме запуска. */
export function isPathVisibleInLaunchMode(path: string, mode: LaunchMode): boolean {
  if (mode === "full") return true;
  if (isOrdersPath(path)) return true;
  // Исключаем "/" из общего префиксного сравнения, чтобы не открыть всё
  return MINIMAL_ALLOWED_PREFIXES.some(
    (p) => p !== "/" && (path === p || path.startsWith(p === "/d/" ? p : `${p}/`) || path === p),
  );
}

/** Чтение режима запуска. */
export function useLaunchMode(): LaunchMode {
  const { data } = useQuery({
    queryKey: ["launch.mode"],
    staleTime: 60_000,
    queryFn: async (): Promise<LaunchMode> => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("setting_value")
        .eq("setting_key", "launch.mode")
        .maybeSingle();
      if (error) return "full";
      const v = data?.setting_value;
      return v === "minimal" ? "minimal" : "full";
    },
  });
  return data ?? "full";
}

export const LAUNCH_MODE_LABELS: Record<LaunchMode, string> = {
  minimal: "Минимальный запуск",
  full: "Полный режим",
};
