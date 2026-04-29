import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Warehouse, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  REQ_WH_STATUS_LABELS,
  REQ_WH_STATUS_OK_FOR_DRIVER,
  REQ_WH_STATUS_STYLES,
  useRequestWarehouseStatus,
  type RequestWarehouseStatus,
} from "@/lib/requestWarehouseStatus";
import { emitWarehouseStatusNotification } from "@/lib/warehouseStatusNotifications";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const HINTS: Record<RequestWarehouseStatus, string> = {
  awaiting_check:
    "Склад ещё не подтвердил товар по этой заявке. Зарезервируйте позиции на складе.",
  shortage:
    "На складе недостаточно товара под заявку. Создайте заявку на пополнение.",
  reserved:
    "Товар зарезервирован под заявку. Подтвердите план загрузки на странице «Склад сегодня», чтобы перейти в «Готово к отгрузке».",
  ready: "Заявка готова к отгрузке — можно выдать маршрут водителю.",
  loading: "Склад начал загрузку машины.",
  loaded: "Все позиции загружены в машину.",
  shipped: "Машина уехала со склада.",
};

export function RequestWarehouseStatusBlock({
  requestId,
  warehouseId,
  onStatusChange,
}: {
  requestId: string;
  warehouseId: string | null;
  onStatusChange?: (status: RequestWarehouseStatus | null) => void;
}) {
  const { data, isLoading } = useRequestWarehouseStatus(requestId, warehouseId);

  // Берём номер заявки и имя склада для уведомлений
  const { data: meta } = useQuery({
    queryKey: ["transport-request-meta", requestId],
    queryFn: async () => {
      const { data: row } = await supabase
        .from("routes")
        .select("route_number, warehouse:warehouse_id(name)")
        .eq("id", requestId)
        .maybeSingle();
      return row as
        | { route_number: string; warehouse: { name: string } | null }
        | null;
    },
  });

  if (data) {
    onStatusChange?.(data.status);
  }

  const status = data?.status;

  // Эмитим уведомление при смене статуса (с дедупликацией на стороне БД).
  const lastEmittedRef = useRef<RequestWarehouseStatus | null>(null);
  useEffect(() => {
    if (!status || !meta?.route_number) return;
    if (lastEmittedRef.current === status) return;
    lastEmittedRef.current = status;
    void emitWarehouseStatusNotification({
      requestId,
      status,
      routeNumber: meta.route_number,
      warehouseId,
      warehouseName: meta.warehouse?.name ?? null,
    });
  }, [status, meta?.route_number, meta?.warehouse?.name, requestId, warehouseId]);

  const okForDriver = status
    ? REQ_WH_STATUS_OK_FOR_DRIVER.includes(status)
    : false;

  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Warehouse className="h-4 w-4" />
          Складской статус
        </div>
        {status ? (
          <Badge
            variant="outline"
            className={REQ_WH_STATUS_STYLES[status]}
          >
            {okForDriver ? (
              <CheckCircle2 className="mr-1 h-3 w-3" />
            ) : status === "shortage" ? (
              <AlertTriangle className="mr-1 h-3 w-3" />
            ) : null}
            {REQ_WH_STATUS_LABELS[status]}
          </Badge>
        ) : (
          <span className="text-xs italic text-muted-foreground">
            {isLoading ? "вычисление…" : "—"}
          </span>
        )}
      </div>
      {status && (
        <div className="px-4 py-3 text-sm text-muted-foreground">
          {HINTS[status]}
        </div>
      )}
    </div>
  );
}
