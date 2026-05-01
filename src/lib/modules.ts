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
