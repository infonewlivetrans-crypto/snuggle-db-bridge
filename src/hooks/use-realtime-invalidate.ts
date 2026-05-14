import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type TableName = "delivery_routes" | "route_points" | "orders";

/**
 * Подписывается на изменения таблицы в Supabase Realtime и инвалидирует
 * указанные query-ключи React Query при любом INSERT/UPDATE/DELETE.
 *
 * Используется для синхронизации между устройствами (логист ↔ водитель).
 */
export function useRealtimeInvalidate(
  table: TableName,
  queryKeys: ReadonlyArray<readonly unknown[]>,
  options?: { filter?: string; enabled?: boolean },
) {
  const qc = useQueryClient();
  const enabled = options?.enabled ?? true;
  const filter = options?.filter;
  // Стабилизируем ключи через JSON — массивы из props пересоздаются на каждом рендере.
  const keysSig = JSON.stringify(queryKeys);

  useEffect(() => {
    if (!enabled) return;
    const channelName = `rt:${table}:${filter ?? "all"}:${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
        () => {
          for (const key of JSON.parse(keysSig) as unknown[][]) {
            qc.invalidateQueries({ queryKey: key });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, filter, enabled, keysSig]);
}
