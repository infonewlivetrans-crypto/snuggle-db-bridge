import { Badge } from "@/components/ui/badge";
import {
  REQ_WH_STATUS_LABELS,
  REQ_WH_STATUS_STYLES,
  useRequestWarehouseStatus,
} from "@/lib/requestWarehouseStatus";

/**
 * Маленький бейдж со складским статусом — для списков заявок и
 * страницы «Склад сегодня». Каждый ряд делает свой кэшируемый запрос.
 */
export function RequestWarehouseStatusBadge({
  requestId,
  warehouseId,
}: {
  requestId: string;
  warehouseId: string | null;
}) {
  const { data, isLoading } = useRequestWarehouseStatus(requestId, warehouseId);

  if (isLoading) {
    return (
      <span className="text-xs italic text-muted-foreground">…</span>
    );
  }
  if (!data) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <Badge variant="outline" className={REQ_WH_STATUS_STYLES[data.status]}>
      {REQ_WH_STATUS_LABELS[data.status]}
    </Badge>
  );
}
