import { useQuery } from "@tanstack/react-query";
import { apiGetAuth } from "@/lib/api-client";

/**
 * Демо-режим управляется настройкой `demo_mode_enabled` в system_settings.
 * Если выключен — бейдж/баннер не показываются и тестовые данные не подставляются.
 */
async function fetchDemoState(): Promise<{
  isDemo: boolean;
  ordersCount: number;
  routesCount: number;
}> {
  try {
    return await apiGetAuth<{
      isDemo: boolean;
      ordersCount: number;
      routesCount: number;
    }>("/api/demo-mode");
  } catch {
    return { isDemo: false, ordersCount: 0, routesCount: 0 };
  }
}

export function useDemoMode() {
  const { data } = useQuery({
    queryKey: ["demo-mode"],
    queryFn: fetchDemoState,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  return {
    isDemo: data?.isDemo ?? false,
    ordersCount: data?.ordersCount ?? 0,
    routesCount: data?.routesCount ?? 0,
  };
}
