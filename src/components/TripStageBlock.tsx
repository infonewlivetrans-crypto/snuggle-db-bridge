// Блок этапов рейса для интерфейса водителя.
// Показывает одну активную кнопку (следующий шаг) и историю этапов.
// Не зависит от GPS — координаты добавляются опционально, если доступны.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, ClipboardList, PackageX, Wallet, Truck, Flag, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
  advanceTripStageFn,
  listRouteReturnsFn,
  listStageEventsFn,
  recordRouteReturnFn,
} from "@/lib/server-functions/trip-stage.functions";
import { getCurrentCoords } from "@/lib/gps";
import {
  TRIP_STAGE_LABELS,
  TRIP_STAGE_STEPS,
  nextStage,
  type TripStage,
} from "@/lib/tripStage";

const STAGE_ICONS: Record<TripStage, typeof Truck> = {
  not_started: Truck,
  arrived_loading: Truck,
  loaded: ClipboardList,
  departed: Truck,
  in_progress: Truck,
  finished: Flag,
  cash_returned: Wallet,
};

type Order = { id: string; order_number: string; contact_name: string | null };

type Props = {
  deliveryRouteId: string;
  currentStage: TripStage;
  driverName: string | null;
  orders?: Order[];
  /** Если задан — блокирует кнопку «Завершил рейс» с пояснением. */
  blockFinishReason?: string | null;
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TripStageBlock({
  deliveryRouteId,
  currentStage,
  driverName,
  orders = [],
}: Props) {
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnForm, setReturnForm] = useState({
    orderId: "",
    reason: "",
    comment: "",
  });

  const eventsQuery = useQuery({
    queryKey: ["trip-stage-events", deliveryRouteId],
    queryFn: () => listStageEventsFn({ data: { deliveryRouteId } }),
  });

  const returnsQuery = useQuery({
    queryKey: ["route-returns", deliveryRouteId],
    queryFn: () => listRouteReturnsFn({ data: { deliveryRouteId } }),
  });

  const advanceMut = useMutation({
    mutationFn: async (stage: TripStage) => {
      const gps = await getCurrentCoords().catch(() => null);
      return advanceTripStageFn({
        data: {
          deliveryRouteId,
          stage,
          comment: comment.trim() || null,
          gps: gps ? { lat: gps.latitude, lng: gps.longitude } : null,
          actorName: driverName,
        },
      });
    },
    onSuccess: (_res, stage) => {
      toast.success(`Этап: ${TRIP_STAGE_LABELS[stage]}`);
      setComment("");
      qc.invalidateQueries({ queryKey: ["trip-stage-events", deliveryRouteId] });
      qc.invalidateQueries({ queryKey: ["driver-route", deliveryRouteId] });
      qc.invalidateQueries({ queryKey: ["delivery-route", deliveryRouteId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const returnMut = useMutation({
    mutationFn: () =>
      recordRouteReturnFn({
        data: {
          deliveryRouteId,
          orderId: returnForm.orderId || null,
          reason: returnForm.reason,
          comment: returnForm.comment || null,
          actorName: driverName,
        },
      }),
    onSuccess: () => {
      toast.success("Возврат зафиксирован");
      setReturnOpen(false);
      setReturnForm({ orderId: "", reason: "", comment: "" });
      qc.invalidateQueries({ queryKey: ["route-returns", deliveryRouteId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const next = nextStage(currentStage);
  const events = eventsQuery.data ?? [];
  const returns = returnsQuery.data ?? [];

  // Для шага показываем время, если он был зафиксирован
  const stageTimes = useMemo(() => {
    const map: Partial<Record<TripStage, string>> = {};
    for (const ev of events) {
      if (!map[ev.stage]) map[ev.stage] = ev.occurred_at;
    }
    return map;
  }, [events]);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Truck className="h-4 w-4 text-primary" />
        <span className="font-semibold">Этапы рейса</span>
      </div>

      {/* Прогресс по шагам */}
      <ol className="space-y-2">
        {TRIP_STAGE_STEPS.map((step) => {
          const Icon = STAGE_ICONS[step];
          const ts = stageTimes[step];
          const done = !!ts;
          const isNext = next === step;
          return (
            <li
              key={step}
              className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
                done
                  ? "border-emerald-500/40 bg-emerald-500/10"
                  : isNext
                    ? "border-primary bg-primary/5"
                    : "border-border bg-muted/30 text-muted-foreground"
              }`}
            >
              <div className="flex items-center gap-2">
                {done ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
                <span className={done ? "font-medium" : ""}>
                  {TRIP_STAGE_LABELS[step]}
                </span>
              </div>
              <div className="text-xs tabular-nums">
                {ts ? fmtTime(ts) : isNext ? "следующий шаг" : "—"}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Активная кнопка — единственная */}
      {next ? (
        <div className="space-y-2">
          <Label htmlFor="stage-comment" className="text-xs text-muted-foreground">
            Комментарий (необязательно)
          </Label>
          <Textarea
            id="stage-comment"
            rows={2}
            placeholder="Например: задержка на загрузке, проблема с документами…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <Button
            size="lg"
            className="w-full gap-1.5"
            disabled={advanceMut.isPending}
            onClick={() => advanceMut.mutate(next)}
          >
            {advanceMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {TRIP_STAGE_LABELS[next]}
          </Button>
        </div>
      ) : (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          Все этапы рейса выполнены.
        </div>
      )}

      {/* Возвраты */}
      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <PackageX className="h-4 w-4 text-orange-600" />
            Возвраты ({returns.length})
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setReturnOpen(true)}
          >
            Оформить возврат
          </Button>
        </div>
        {returns.length > 0 && (
          <ul className="space-y-1.5 text-xs">
            {returns.map((r) => {
              const ord = orders.find((o) => o.id === r.order_id);
              return (
                <li
                  key={r.id}
                  className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {ord ? `№${ord.order_number}` : r.order_id ? "Заказ" : "Без заказа"}
                      {" · "}
                      {r.reason}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {fmtTime(r.occurred_at)}
                    </span>
                  </div>
                  {r.comment && (
                    <div className="mt-0.5 text-muted-foreground">{r.comment}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Оформление возврата</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Заказ (необязательно)</Label>
              <Select
                value={returnForm.orderId || "none"}
                onValueChange={(v) =>
                  setReturnForm({ ...returnForm, orderId: v === "none" ? "" : v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите заказ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без привязки к заказу</SelectItem>
                  {orders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      №{o.order_number}
                      {o.contact_name ? ` · ${o.contact_name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Причина возврата *</Label>
              <Input
                value={returnForm.reason}
                onChange={(e) => setReturnForm({ ...returnForm, reason: e.target.value })}
                placeholder="Например: клиент отказался, брак товара…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Комментарий</Label>
              <Textarea
                rows={3}
                value={returnForm.comment}
                onChange={(e) => setReturnForm({ ...returnForm, comment: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnOpen(false)}>
              Отмена
            </Button>
            <Button
              onClick={() => returnMut.mutate()}
              disabled={returnMut.isPending || !returnForm.reason.trim()}
            >
              {returnMut.isPending ? "Сохранение…" : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
