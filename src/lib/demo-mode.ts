import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Демо-режим управляется настройкой `demo_mode_enabled` в system_settings.
 * Если выключен — бейдж/баннер не показываются и тестовые данные не подставляются.
 */
async function fetchDemoState(): Promise<{
  isDemo: boolean;
  ordersCount: number;
  routesCount: number;
}> {
  const [settingRes, ordersRes, routesRes] = await Promise.all([
    supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "demo_mode_enabled")
      .maybeSingle(),
    supabase.from("orders").select("id", { count: "exact", head: true }),
    supabase.from("routes").select("id", { count: "exact", head: true }),
  ]);

  // По умолчанию демо-режим выключен.
  const raw = settingRes.data?.setting_value as unknown;
  const enabled =
    raw === true ||
    raw === "true" ||
    (typeof raw === "object" && raw !== null && (raw as { enabled?: boolean }).enabled === true);

  return {
    isDemo: Boolean(enabled),
    ordersCount: ordersRes.count ?? 0,
    routesCount: routesRes.count ?? 0,
  };
}

export function useDemoMode() {
  const { data } = useQuery({
    queryKey: ["demo-mode"],
    queryFn: fetchDemoState,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  return {
    isDemo: data?.isDemo ?? false,
    ordersCount: data?.ordersCount ?? 0,
    routesCount: data?.routesCount ?? 0,
  };
}
