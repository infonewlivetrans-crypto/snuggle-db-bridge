import { useEffect } from "react";

type TableName = "delivery_routes" | "route_points" | "orders";

/**
 * NO-OP: ранее открывал Supabase Realtime канал и инвалидировал React Query.
 * Сейчас отключён — production backend не отдаёт WebSocket realtime, и
 * прямые подписки из браузера приводили к WS ERR_CONNECTION_REFUSED и
 * каскадным ошибкам в консоли. Сигнатура и все вызовы оставлены без изменений,
 * чтобы не править вызывающие компоненты. Инвалидация теперь идёт через
 * обычные refetch'и React Query (refetchInterval, refetchOnWindowFocus и т.п.).
 */
export function useRealtimeInvalidate(
  _table: TableName,
  _queryKeys: ReadonlyArray<readonly unknown[]>,
  _options?: { filter?: string; enabled?: boolean },
) {
  useEffect(() => {
    return;
  }, []);
}
