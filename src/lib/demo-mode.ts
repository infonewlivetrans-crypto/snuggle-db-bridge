import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Демо-режим = ключевые таблицы пусты или содержат только seed-демо.
 * Простая эвристика: если в orders < 3 и в routes < 3 — считаем демо.
 * Запрашиваем `head:true, count:'exact'` — это очень дёшево (только COUNT).
 */
async function fetchDemoState(): Promise<{ isDemo: boolean; ordersCount: number; routesCount: number }> {
  const [{ count: ordersCount }, { count: routesCount }] = await Promise.all([
    supabase.from("orders").select("id", { count: "exact", head: true }),
    supabase.from("routes").select("id", { count: "exact", head: true }),
  ]);
  const o = ordersCount ?? 0;
  const r = routesCount ?? 0;
  // База считается «полностью рабочей», когда видно ≥ 30 заказов и ≥ 15 рейсов.
  // Иначе подсвечиваем демо-режим, чтобы пользователь понимал, что данные тестовые.
  const isDemo = o < 30 || r < 15;
  return { isDemo, ordersCount: o, routesCount: r };
}

export function useDemoMode() {
  const { data } = useQuery({
    queryKey: ["demo-mode"],
    queryFn: fetchDemoState,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  return {
    isDemo: data?.isDemo ?? true,
    ordersCount: data?.ordersCount ?? 0,
    routesCount: data?.routesCount ?? 0,
  };
}
