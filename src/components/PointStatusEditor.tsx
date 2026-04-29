import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Save } from "lucide-react";
import { toast } from "sonner";
import {
  DELIVERY_POINT_STATUS_LABELS,
  DELIVERY_POINT_STATUS_ORDER,
  DELIVERY_POINT_STATUS_STYLES,
  DELIVERY_POINT_UNDELIVERED_REASON_LABELS,
  DELIVERY_POINT_UNDELIVERED_REASON_ORDER,
  type DeliveryPointStatus,
  type DeliveryPointUndeliveredReason,
} from "@/lib/deliveryPointStatus";

type Props = {
  routePointId: string;
  initial: {
    dp_status: DeliveryPointStatus;
    dp_undelivered_reason: DeliveryPointUndeliveredReason | null;
    dp_return_warehouse_id: string | null;
    dp_return_comment: string | null;
    dp_expected_return_at: string | null;
    dp_payment_comment?: string | null;
    dp_amount_received?: number | null;
  };
  order?: {
    payment_type: string;
    requires_qr: boolean;
    cash_received: boolean;
    qr_received: boolean;
    payment_status?: string;
    amount_due?: number | null;
  };
  hasQrPhoto?: boolean;
  hasProblemPhoto?: boolean;
  hasDocumentsPhoto?: boolean;
  onSaved?: () => void;
};

export function PointStatusEditor({ routePointId, initial, order, hasQrPhoto, hasProblemPhoto, hasDocumentsPhoto, onSaved }: Props) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<DeliveryPointStatus>(initial.dp_status);
  const [reason, setReason] = useState<DeliveryPointUndeliveredReason | "">(
    initial.dp_undelivered_reason ?? "",
  );
  const [returnWh, setReturnWh] = useState<string>(initial.dp_return_warehouse_id ?? "");
  const [returnComment, setReturnComment] = useState<string>(initial.dp_return_comment ?? "");
  const [deliveredComment, setDeliveredComment] = useState<string>(initial.dp_payment_comment ?? "");
  const [notDeliveredComment, setNotDeliveredComment] = useState<string>(initial.dp_payment_comment ?? "");
  const [expectedReturn, setExpectedReturn] = useState<string>(
    initial.dp_expected_return_at ? toLocalDT(initial.dp_expected_return_at) : "",
  );

  useEffect(() => {
    setDeliveredComment(initial.dp_payment_comment ?? "");
    setNotDeliveredComment(initial.dp_payment_comment ?? "");
  }, [routePointId, initial.dp_payment_comment]);

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name, city")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (status === "delivered" && order) {
        // 1) QR обязателен
        if (order.requires_qr && (!order.qr_received || !hasQrPhoto)) {
          throw new Error("Нельзя завершить доставку без QR-кода.");
        }
        // 2) Наличные + не оплачено заранее → подтверждение оплаты
        const isPrepaid = order.payment_status === "paid";
        if (order.payment_type === "cash" && !isPrepaid) {
          const amountReceived = initial.dp_amount_received;
          if (!order.cash_received || amountReceived == null || Number(amountReceived) <= 0) {
            throw new Error("Нельзя завершить доставку без подтверждения оплаты.");
          }
        }
        // 3) Фото документов обязательно
        if (!hasDocumentsPhoto) {
          throw new Error("Нельзя завершить доставку без фото документов.");
        }
        // Комментарий обязателен, если есть расхождение по оплате
        const due = Number(order.amount_due ?? 0);
        const got = Number(initial.dp_amount_received ?? 0);
        if (due > 0 && got > 0 && got !== due && !deliveredComment.trim()) {
          throw new Error("Укажите комментарий: есть расхождение по оплате.");
        }
      }
      if (status === "not_delivered") {
        if (!reason) {
          throw new Error("Укажите причину недоставки.");
        }
        if (!hasProblemPhoto) {
          throw new Error("Загрузите фото проблемы для статуса «Не доставлено».");
        }
        if (!notDeliveredComment.trim()) {
          throw new Error("Укажите комментарий к недоставке.");
        }
      }
      if (status === "returned_to_warehouse") {
        if (!returnWh) {
          throw new Error("Выберите склад возврата.");
        }
        if (!hasProblemPhoto) {
          throw new Error("Загрузите фото для возврата на склад.");
        }
        if (!returnComment.trim()) {
          throw new Error("Укажите причину возврата в комментарии.");
        }
      }
      const payload: Record<string, unknown> = {
        dp_status: status,
        dp_status_changed_at: new Date().toISOString(),
        dp_undelivered_reason: status === "not_delivered" ? (reason || null) : null,
        dp_return_warehouse_id: status === "returned_to_warehouse" ? (returnWh || null) : null,
        dp_return_comment: status === "returned_to_warehouse" ? (returnComment || null) : null,
        dp_expected_return_at:
          status === "returned_to_warehouse" && expectedReturn
            ? new Date(expectedReturn).toISOString()
            : null,
        dp_payment_comment:
          status === "delivered"
            ? (deliveredComment.trim() || null)
            : status === "not_delivered"
              ? (notDeliveredComment.trim() || null)
              : initial.dp_payment_comment ?? null,
      };
      const { error } = await (supabase.from("route_points") as unknown as {
        update: (p: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: Error | null }> };
      }).update(payload).eq("id", routePointId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Статус точки сохранён");
      qc.invalidateQueries({ queryKey: ["delivery-route-points"] });
      onSaved?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={DELIVERY_POINT_STATUS_STYLES[initial.dp_status]}>
          {DELIVERY_POINT_STATUS_LABELS[initial.dp_status]}
        </Badge>
        <Select value={status} onValueChange={(v) => setStatus(v as DeliveryPointStatus)}>
          <SelectTrigger className="h-8 w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DELIVERY_POINT_STATUS_ORDER.map((s) => (
              <SelectItem key={s} value={s}>{DELIVERY_POINT_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} className="gap-1.5">
          <Save className="h-3.5 w-3.5" />Сохранить
        </Button>
      </div>

      {status === "delivered" && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
          <div className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
            Подтверждение доставки
          </div>
          <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
            {order?.requires_qr && <li>Загрузите фото QR-кода</li>}
            {order?.payment_type === "cash" && order?.payment_status !== "paid" && (
              <li>Укажите фактически полученную сумму и подтвердите оплату</li>
            )}
            <li>Загрузите фото документов</li>
          </ul>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">
              Комментарий {(() => {
                const due = Number(order?.amount_due ?? 0);
                const got = Number(initial.dp_amount_received ?? 0);
                return due > 0 && got > 0 && got !== due ? "(обязателен — есть расхождение по оплате)" : "";
              })()}
            </div>
            <Textarea
              value={deliveredComment}
              onChange={(e) => setDeliveredComment(e.target.value)}
              rows={2}
              placeholder="Комментарий по доставке / расхождению"
            />
          </div>
        </div>
      )}

      {status === "not_delivered" && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 space-y-2">
          <div className="text-xs font-medium text-red-700 dark:text-red-300">
            Причина недоставки
          </div>
          <Select value={reason} onValueChange={(v) => setReason(v as DeliveryPointUndeliveredReason)}>
            <SelectTrigger className="h-8"><SelectValue placeholder="Выберите причину" /></SelectTrigger>
            <SelectContent>
              {DELIVERY_POINT_UNDELIVERED_REASON_ORDER.map((r) => (
                <SelectItem key={r} value={r}>{DELIVERY_POINT_UNDELIVERED_REASON_LABELS[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="text-xs text-muted-foreground">
            Также обязательно: фото проблемы и комментарий.
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Комментарий</div>
            <Textarea
              value={notDeliveredComment}
              onChange={(e) => setNotDeliveredComment(e.target.value)}
              rows={2}
              placeholder="Что произошло, детали"
            />
          </div>
        </div>
      )}

      {status === "returned_to_warehouse" && (
        <div className="space-y-2 rounded-md border border-orange-500/30 bg-orange-500/5 p-3">
          <div className="text-xs font-medium text-orange-700 dark:text-orange-300">
            Возврат на склад
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Склад возврата</div>
            <Select value={returnWh} onValueChange={setReturnWh}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Выберите склад" /></SelectTrigger>
              <SelectContent>
                {(warehouses ?? []).map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}{w.city ? `, ${w.city}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Ожидаемое время возврата</div>
            <Input
              type="datetime-local"
              value={expectedReturn}
              onChange={(e) => setExpectedReturn(e.target.value)}
              className="h-8"
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Комментарий</div>
            <Textarea
              value={returnComment}
              onChange={(e) => setReturnComment(e.target.value)}
              rows={2}
              placeholder="Причина возврата, особенности"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function toLocalDT(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
