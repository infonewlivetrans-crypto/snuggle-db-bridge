import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { POINT_ACTION_LABELS, type PointActionRow } from "@/lib/pointActions";
import { apiGetAuth } from "@/lib/api-client";

interface Props {
  /** Если передан orderId — показываем историю по всем точкам этого заказа */
  orderId?: string;
  /** Если передан routePointId — показываем историю одной точки */
  routePointId?: string;
  /** Если передан routeId — показываем историю по всему маршруту */
  routeId?: string;
  title?: string;
  maxHeight?: string;
}

export function PointActionsHistory({
  orderId,
  routePointId,
  routeId,
  title = "История доставки",
  maxHeight = "max-h-72",
}: Props) {
  const key = ["point_actions", { orderId, routePointId, routeId }];
  const { data, isLoading } = useQuery({
    queryKey: key,
    enabled: !!(orderId || routePointId || routeId),
    queryFn: async (): Promise<PointActionRow[]> => {
      const params = new URLSearchParams();
      if (orderId) params.set("orderId", orderId);
      else if (routePointId) params.set("routePointId", routePointId);
      else if (routeId) params.set("routeId", routeId);

      return await apiGetAuth<PointActionRow[]>(
        `/api/point-actions?${params.toString()}`,
      );
    },
  });

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <History className="h-3.5 w-3.5" />
        {title}
      </div>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Загрузка...</div>
      ) : !data || data.length === 0 ? (
        <div className="text-sm italic text-muted-foreground">Действий пока нет</div>
      ) : (
        <ul className={`${maxHeight} space-y-2 overflow-y-auto`}>
          {data.map((row) => {
            const label = POINT_ACTION_LABELS[row.action] ?? row.action;
            const detailText = renderDetails(row);
            return (
              <li
                key={row.id}
                className="rounded-md border border-border bg-secondary/30 p-2 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{label}</span>
                  <span className="shrink-0 text-muted-foreground">
                    <span suppressHydrationWarning>{new Date(row.created_at).toLocaleString("ru-RU", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}</span>
                  </span>
                </div>
                {detailText && (
                  <div className="mt-1 text-foreground">{detailText}</div>
                )}
                {row.comment && (
                  <div className="mt-1 italic text-muted-foreground">«{row.comment}»</div>
                )}
                {row.actor && (
                  <div className="mt-1 text-muted-foreground">Водитель: {row.actor}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function renderDetails(row: PointActionRow): string | null {
  const d = (row.details ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  if (row.action === "payment_amount_set" && d.amount_received != null) {
    parts.push(`Сумма: ${Number(d.amount_received).toLocaleString("ru-RU")} ₽`);
  }
  if (row.action === "status_not_delivered" && d.reason) {
    parts.push(`Причина: ${d.reason}`);
  }
  if (row.action === "status_returned" && d.reason) {
    parts.push(`Причина возврата: ${d.reason}`);
  }
  const gps = (d.gps ?? null) as
    | { latitude: number; longitude: number; accuracy?: number | null }
    | null;
  if (gps && typeof gps.latitude === "number" && typeof gps.longitude === "number") {
    const acc = gps.accuracy != null ? ` (±${Math.round(Number(gps.accuracy))} м)` : "";
    parts.push(`📍 ${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)}${acc}`);
  } else if (d.gps_unavailable) {
    parts.push("📍 GPS недоступен");
  }
  if (typeof d.distance_to_point_m === "number") {
    parts.push(`До точки: ${Math.round(d.distance_to_point_m)} м`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
