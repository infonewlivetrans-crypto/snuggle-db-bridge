import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  type Order,
  type OrderStatus,
  STATUS_LABELS,
  STATUS_ORDER,
  STATUS_STYLES,
  PAYMENT_LABELS,
} from "@/lib/orders";
import { POINT_STATUS_LABELS, type PointStatus } from "@/lib/routes";
import { DeliveryLocation } from "@/components/DeliveryLocation";
import { AddOrderToRouteDialog } from "@/components/AddOrderToRouteDialog";
import { QrCapture } from "@/components/QrCapture";
import {
  MessageSquare,
  Banknote,
  QrCode,
  Hash,
  CreditCard,
  Database,
  AlertTriangle,
  CheckCircle2,
  Route as RouteIcon,
  Wallet,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { ManualDeliveryCostDialog } from "@/components/ManualDeliveryCostDialog";

type DeliveryReport = {
  id: string;
  outcome: string;
  reason: string | null;
  driver_name: string | null;
  comment: string | null;
  requires_resend: boolean;
  delivered_at: string;
};

interface OrderDetailDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrderDetailDialog({ order, open, onOpenChange }: OrderDetailDialogProps) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<OrderStatus>(order?.status ?? "new");
  const [cashReceived, setCashReceived] = useState(order?.cash_received ?? false);
  const [qrReceived, setQrReceived] = useState(order?.qr_received ?? false);
  const [addToRouteOpen, setAddToRouteOpen] = useState(false);
  const [manualCostOpen, setManualCostOpen] = useState(false);

  // Sync state when order changes
  if (order && open && order.id !== (status as unknown as string) + order.id) {
    // noop — guard
  }

  // Reset local state when a new order opens
  const orderId = order?.id;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useStateSync(orderId, () => {
    if (order) {
      setStatus(order.status);
      setCashReceived(order.cash_received);
      setQrReceived(order.qr_received);
    }
  });

  // Sync QR / status when query data refreshes (e.g. after QR upload/delete)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!order) return;
    setQrReceived(order.qr_received);
    setStatus(order.status);
  }, [order?.qr_received, order?.qr_photo_url, order?.status]);

  const mutation = useMutation({
    mutationFn: async (updates: Partial<Order>) => {
      if (!order) throw new Error("Нет заказа");
      const { error } = await supabase
        .from("orders")
        .update(updates)
        .eq("id", order.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Заказ обновлён");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetToAuto = useMutation({
    mutationFn: async () => {
      if (!order) throw new Error("Нет заказа");
      const { error } = await supabase
        .from("orders")
        .update({ delivery_cost_source: "auto" })
        .eq("id", order.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["routes"] });
      toast.success("Возвращён автоматический расчёт по тарифам");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Отчёты о доставке для этого заказа
  const { data: reports } = useQuery({
    queryKey: ["delivery_reports", order?.id],
    enabled: !!order?.id && open,
    queryFn: async (): Promise<DeliveryReport[]> => {
      const { data, error } = await (
        supabase.from as unknown as (
          name: string,
        ) => {
          select: (cols: string) => {
            eq: (
              c: string,
              v: string,
            ) => {
              order: (
                c: string,
                opts: { ascending: boolean },
              ) => Promise<{ data: DeliveryReport[] | null; error: Error | null }>;
            };
          };
        }
      )("delivery_reports")
        .select("*")
        .eq("order_id", order!.id)
        .order("delivered_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!order) return null;

  const latestReport = reports?.[0];

  const handleSave = () => {
    mutation.mutate({
      status,
      cash_received: cashReceived,
      qr_received: qrReceived,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4 pr-6">
            <div>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <Hash className="h-5 w-5 text-muted-foreground" />
                Заказ {order.order_number}
              </DialogTitle>
              <DialogDescription className="mt-1">
                Карточка заказа · управление статусом и оплатой
              </DialogDescription>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge variant="outline" className={STATUS_STYLES[order.status]}>
                {STATUS_LABELS[order.status]}
              </Badge>
              {order.requires_qr && (
                <Badge
                  variant="outline"
                  className={
                    order.qr_received
                      ? "border-green-300 bg-green-100 text-green-900"
                      : "border-amber-300 bg-amber-100 text-amber-900"
                  }
                >
                  QR: {order.qr_received ? "получен" : "не получен"}
                </Badge>
              )}
              <Badge
                variant="outline"
                className="border-border bg-secondary text-xs text-muted-foreground"
              >
                <Database className="mr-1 h-3 w-3" />
                Источник: 1С
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Адрес и навигация */}
          <DeliveryLocation order={order} />

          {/* Отчёт о доставке (если есть) */}
          {latestReport && (
            <div
              className={`rt-alert ${
                latestReport.outcome === "delivered"
                  ? "rt-alert-success"
                  : latestReport.outcome === "defective"
                    ? "rt-alert-warning"
                    : "rt-alert-danger"
              } flex-col`}
            >
              <div className="mb-2 flex w-full items-center justify-between">
                <div className="flex items-center gap-2">
                  {latestReport.outcome === "delivered" ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <AlertTriangle className="h-4 w-4" />
                  )}
                  <span className="text-sm font-semibold text-foreground">
                    {latestReport.outcome === "delivered"
                      ? "Доставлено"
                      : latestReport.outcome === "defective"
                        ? "Брак · требуется повторная отправка"
                        : "Не доставлено"}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(latestReport.delivered_at).toLocaleString("ru-RU", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="space-y-1 text-sm text-foreground">
                {latestReport.driver_name && (
                  <div>
                    <span className="text-muted-foreground">Водитель: </span>
                    {latestReport.driver_name}
                  </div>
                )}
                {latestReport.reason && latestReport.outcome !== "delivered" && (
                  <div>
                    <span className="text-muted-foreground">Причина: </span>
                    {POINT_STATUS_LABELS[latestReport.reason as PointStatus] ?? latestReport.reason}
                  </div>
                )}
                {latestReport.requires_resend && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="badge-status badge-status-delivering">
                      <AlertTriangle className="h-3 w-3" />
                      Требуется повторная доставка
                    </span>
                    <Button size="sm" onClick={() => setAddToRouteOpen(true)} className="h-7 gap-1.5">
                      <RouteIcon className="h-3.5 w-3.5" />
                      Добавить в следующий маршрут
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Стоимость доставки */}
          <DeliveryCostBlock
            order={order}
            onEdit={() => setManualCostOpen(true)}
            onResetAuto={() => resetToAuto.mutate()}
            resetting={resetToAuto.isPending}
          />

          {/* Тип оплаты */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border p-3">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <CreditCard className="h-3.5 w-3.5" />
                Тип оплаты
              </div>
              <div className="text-sm font-semibold text-foreground">
                {PAYMENT_LABELS[order.payment_type]}
              </div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <QrCode className="h-3.5 w-3.5" />
                Требуется QR
              </div>
              <div className="text-sm font-semibold text-foreground">
                {order.requires_qr ? "Да" : "Нет"}
              </div>
            </div>
          </div>

          {/* QR-код заказа */}
          <QrCapture
            orderId={order.id}
            orderNumber={order.order_number}
            requiresQr={order.requires_qr}
            qrPhotoUrl={order.qr_photo_url}
            qrUploadedAt={order.qr_photo_uploaded_at}
          />

          {/* Комментарий */}
          <div className="rounded-lg border border-border p-4">
            <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5" />
              Комментарий
            </div>
            <div className="text-sm text-foreground">
              {order.comment || (
                <span className="italic text-muted-foreground">Без комментария</span>
              )}
            </div>
          </div>

          {/* Статус */}
          <div>
            <Label htmlFor="status" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Статус заказа
            </Label>
            <Select value={status} onValueChange={(v) => setStatus(v as OrderStatus)}>
              <SelectTrigger id="status" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Оплата получена */}
          <div className="space-y-3 rounded-lg border border-border bg-secondary/40 p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Подтверждение оплаты
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="cash" className="flex items-center gap-2 text-sm font-medium">
                <Banknote className="h-4 w-4 text-muted-foreground" />
                Наличные получены
              </Label>
              <Switch id="cash" checked={cashReceived} onCheckedChange={setCashReceived} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="qr" className="flex items-center gap-2 text-sm font-medium">
                <QrCode className="h-4 w-4 text-muted-foreground" />
                QR получен
              </Label>
              <Switch id="qr" checked={qrReceived} onCheckedChange={setQrReceived} />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setAddToRouteOpen(true)} className="gap-1.5 mr-auto">
              <RouteIcon className="h-4 w-4" />
              В маршрут
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button onClick={handleSave} disabled={mutation.isPending}>
              {mutation.isPending ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </DialogContent>
      <AddOrderToRouteDialog order={order} open={addToRouteOpen} onOpenChange={setAddToRouteOpen} />
      <ManualDeliveryCostDialog order={order} open={manualCostOpen} onOpenChange={setManualCostOpen} />
    </Dialog>
  );
}

// Helper: re-runs effect when key changes
import { useRef } from "react";
function useStateSync(key: string | undefined, fn: () => void) {
  const prev = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prev.current !== key) {
      prev.current = key;
      fn();
    }
  }, [key, fn]);
}

function DeliveryCostBlock({
  order,
  onEdit,
  onResetAuto,
  resetting,
}: {
  order: Order;
  onEdit: () => void;
  onResetAuto: () => void;
  resetting: boolean;
}) {
  const source = order.delivery_cost_source ?? "auto";
  const cost = Number(order.delivery_cost ?? 0);
  const isManual = source === "manual";
  const sourceLabel =
    source === "manual" ? "Вручную" : source === "tariff" ? "По тарифу" : "Авто";
  const sourceClass = isManual
    ? "border-amber-300 bg-amber-100 text-amber-900"
    : source === "tariff"
      ? "border-blue-300 bg-blue-100 text-blue-900"
      : "border-border bg-secondary text-muted-foreground";

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Wallet className="h-3.5 w-3.5" />
          Стоимость доставки
        </div>
        <Badge variant="outline" className={sourceClass}>
          {sourceLabel}
        </Badge>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xl font-bold text-foreground">
            {cost.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽
          </div>
          {isManual && order.manual_cost_set_at && (
            <div className="mt-1 text-xs text-muted-foreground">
              Изменено{" "}
              {new Date(order.manual_cost_set_at).toLocaleString("ru-RU", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
              {order.manual_cost_set_by ? ` · ${order.manual_cost_set_by}` : ""}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {isManual && (
            <Button
              variant="outline"
              size="sm"
              onClick={onResetAuto}
              disabled={resetting}
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {resetting ? "..." : "К авто"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5">
            <Pencil className="h-3.5 w-3.5" />
            Изменить вручную
          </Button>
        </div>
      </div>
      {isManual && order.manual_cost_reason && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          <span className="font-medium">Причина:</span> {order.manual_cost_reason}
        </div>
      )}
      {isManual && (
        <div className="mt-2 text-xs text-muted-foreground">
          Автоматический пересчёт по тарифам отключён для этого заказа.
        </div>
      )}
    </div>
  );
}
