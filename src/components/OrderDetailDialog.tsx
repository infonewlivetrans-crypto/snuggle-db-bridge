import { useState } from "react";
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
import {
  MapPin,
  MessageSquare,
  Banknote,
  QrCode,
  Hash,
  CreditCard,
  Database,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

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
          {/* Адрес */}
          <div className="rounded-lg border border-border bg-secondary/40 p-4">
            <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              Адрес доставки
            </div>
            <div className="text-sm font-medium text-foreground">{order.delivery_address}</div>
          </div>

          {/* Отчёт о доставке (если есть) */}
          {latestReport && (
            <div
              className={`rounded-lg border p-4 ${
                latestReport.outcome === "delivered"
                  ? "border-green-200 bg-green-50"
                  : latestReport.outcome === "defective"
                    ? "border-amber-200 bg-amber-50"
                    : "border-red-200 bg-red-50"
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {latestReport.outcome === "delivered" ? (
                    <CheckCircle2 className="h-4 w-4 text-green-700" />
                  ) : (
                    <AlertTriangle
                      className={`h-4 w-4 ${
                        latestReport.outcome === "defective" ? "text-amber-700" : "text-red-700"
                      }`}
                    />
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
                  <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900">
                    <AlertTriangle className="h-3 w-3" />
                    Требуется добавить в следующий маршрут
                  </div>
                )}
              </div>
            </div>
          )}

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

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button onClick={handleSave} disabled={mutation.isPending}>
              {mutation.isPending ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Helper: re-runs effect when key changes
import { useEffect, useRef } from "react";
function useStateSync(key: string | undefined, fn: () => void) {
  const prev = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prev.current !== key) {
      prev.current = key;
      fn();
    }
  }, [key, fn]);
}
