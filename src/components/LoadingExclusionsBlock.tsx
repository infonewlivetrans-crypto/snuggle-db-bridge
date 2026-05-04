// Блок управления составом маршрута на погрузке.
// Показывается водителю на этапах "Прибыл на загрузку" и "Загрузился".
// Позволяет убрать заказ из рейса с указанием причины.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PackageMinus, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EXCLUSION_REASONS,
  type ExclusionReason,
  excludeOrderFromRouteFn,
  listRouteExclusionsFn,
} from "@/lib/server-functions/route-exclusions.functions";
import type { TripStage } from "@/lib/tripStage";

type OrderItem = {
  id: string;
  order_number: string;
  contact_name: string | null;
  delivery_address: string | null;
};

type Props = {
  deliveryRouteId: string;
  currentStage: TripStage;
  driverName: string | null;
  orders: OrderItem[];
};

export function LoadingExclusionsBlock({
  deliveryRouteId,
  currentStage,
  driverName,
  orders,
}: Props) {
  const qc = useQueryClient();
  const allowed = currentStage === "arrived_loading" || currentStage === "loaded";

  const exclusionsQuery = useQuery({
    queryKey: ["route-exclusions", deliveryRouteId],
    queryFn: () => listRouteExclusionsFn({ data: { deliveryRouteId } }),
  });

  const [target, setTarget] = useState<OrderItem | null>(null);
  const [reason, setReason] = useState<ExclusionReason>(EXCLUSION_REASONS[0]);
  const [comment, setComment] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      excludeOrderFromRouteFn({
        data: {
          deliveryRouteId,
          orderId: target!.id,
          reason,
          comment: comment.trim() || null,
          actorName: driverName,
        },
      }),
    onSuccess: () => {
      toast.success(`Заказ №${target?.order_number} убран из рейса`);
      setTarget(null);
      setReason(EXCLUSION_REASONS[0]);
      setComment("");
      qc.invalidateQueries({ queryKey: ["route-exclusions", deliveryRouteId] });
      qc.invalidateQueries({ queryKey: ["delivery-route-points"] });
      qc.invalidateQueries({ queryKey: ["driver-route", deliveryRouteId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exclusions = exclusionsQuery.data ?? [];
  const needsComment = reason === "Другая причина";
  const canSubmit = !!target && !mut.isPending && (!needsComment || comment.trim().length > 0);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <PackageMinus className="h-4 w-4 text-orange-600" />
        <span className="font-semibold">Состав маршрута на погрузке</span>
      </div>

      {!allowed ? (
        <div className="rounded-md border border-muted bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Изменять состав можно только во время погрузки. После выезда на линию используйте «Возврат» или «Проблема доставки».
        </div>
      ) : orders.length === 0 ? (
        <div className="text-xs text-muted-foreground">В маршруте нет заказов.</div>
      ) : (
        <ul className="space-y-1.5">
          {orders.map((o) => (
            <li
              key={o.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <div className="font-medium">№{o.order_number}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {o.contact_name ?? "—"}
                  {o.delivery_address ? ` · ${o.delivery_address}` : ""}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1"
                onClick={() => {
                  setTarget(o);
                  setReason(EXCLUSION_REASONS[0]);
                  setComment("");
                }}
              >
                <PackageMinus className="h-3.5 w-3.5" />
                Убрать из рейса
              </Button>
            </li>
          ))}
        </ul>
      )}

      {exclusions.length > 0 && (
        <div className="space-y-1.5 border-t border-border pt-3">
          <div className="text-xs font-semibold text-muted-foreground">
            Убрано из рейса ({exclusions.length})
          </div>
          <ul className="space-y-1 text-xs">
            {exclusions.map((e) => (
              <li
                key={e.id}
                className="rounded-md border border-orange-500/30 bg-orange-500/10 px-2.5 py-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{e.reason}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {new Date(e.excluded_at).toLocaleTimeString("ru-RU", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {e.comment && <div className="mt-0.5 text-muted-foreground">{e.comment}</div>}
                {e.excluded_by_name && (
                  <div className="text-[11px] text-muted-foreground">— {e.excluded_by_name}</div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={target !== null} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Убрать заказ из рейса</DialogTitle>
          </DialogHeader>
          {target && (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                <div className="font-medium">№{target.order_number}</div>
                <div className="text-xs text-muted-foreground">
                  {target.contact_name ?? "—"}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Причина</Label>
                <Select value={reason} onValueChange={(v) => setReason(v as ExclusionReason)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXCLUSION_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>
                  Комментарий{needsComment ? " (обязательно)" : " (необязательно)"}
                </Label>
                <Textarea
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={needsComment ? "Опишите причину…" : ""}
                />
              </div>

              <div className="flex items-start gap-1.5 rounded-md border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-xs text-orange-800 dark:text-orange-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Заказ не будет удалён из системы — он получит статус «Исключён из рейса».
                  Менеджер получит уведомление с причиной.
                </span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>
              Отмена
            </Button>
            <Button onClick={() => mut.mutate()} disabled={!canSubmit}>
              {mut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Убрать из рейса
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
