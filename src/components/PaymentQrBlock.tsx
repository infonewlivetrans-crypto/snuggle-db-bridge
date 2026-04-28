import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, QrCode, Banknote, ShoppingBag, Save } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  cash: "Наличные",
  card: "Карта",
  qr: "QR (СБП)",
  invoice: "Счёт",
  prepaid: "Предоплата",
};

export type PaymentQrOrder = {
  id: string;
  payment_type: string;
  amount_due: number | null;
  requires_qr: boolean;
  marketplace: string | null;
  cash_received: boolean;
  qr_received: boolean;
};

export type PaymentQrPoint = {
  dp_amount_received: number | null;
  dp_payment_comment: string | null;
};

type Props = {
  routePointId: string;
  order: PaymentQrOrder;
  point: PaymentQrPoint;
};

export function PaymentQrBlock({ routePointId, order, point }: Props) {
  const qc = useQueryClient();
  const [cashReceived, setCashReceived] = useState(order.cash_received);
  const [qrReceived, setQrReceived] = useState(order.qr_received);
  const [amountReceived, setAmountReceived] = useState<string>(
    point.dp_amount_received != null ? String(point.dp_amount_received) : "",
  );
  const [paymentComment, setPaymentComment] = useState<string>(point.dp_payment_comment ?? "");

  useEffect(() => {
    setCashReceived(order.cash_received);
    setQrReceived(order.qr_received);
    setAmountReceived(point.dp_amount_received != null ? String(point.dp_amount_received) : "");
    setPaymentComment(point.dp_payment_comment ?? "");
  }, [order.id, order.cash_received, order.qr_received, point.dp_amount_received, point.dp_payment_comment]);

  const isCash = order.payment_type === "cash";
  const isMarketplace = !!order.marketplace && order.marketplace.trim().length > 0;

  const amountNum = amountReceived === "" ? null : Number(amountReceived);
  const hasMismatch =
    order.amount_due != null && amountNum != null && !Number.isNaN(amountNum) && amountNum !== order.amount_due;

  const save = useMutation({
    mutationFn: async () => {
      const { error: e1 } = await supabase
        .from("orders")
        .update({ cash_received: cashReceived, qr_received: qrReceived })
        .eq("id", order.id);
      if (e1) throw e1;

      const payload: Record<string, unknown> = {
        dp_amount_received: amountNum,
        dp_payment_comment: paymentComment || null,
      };
      const { error: e2 } = await (
        supabase.from("route_points") as unknown as {
          update: (p: Record<string, unknown>) => {
            eq: (c: string, v: string) => Promise<{ error: Error | null }>;
          };
        }
      )
        .update(payload)
        .eq("id", routePointId);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Оплата и QR сохранены");
      qc.invalidateQueries({ queryKey: ["delivery-route-points"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-md border border-border bg-card/50 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <QrCode className="h-3.5 w-3.5" />
        QR и оплата
      </div>

      {/* Сводная информация о заказе */}
      <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Info icon={<Banknote className="h-3.5 w-3.5" />} label="Тип оплаты">
          {PAYMENT_TYPE_LABELS[order.payment_type] ?? order.payment_type}
        </Info>
        <Info label="К получению">
          {order.amount_due != null ? `${order.amount_due} ₽` : "—"}
        </Info>
        <Info icon={<QrCode className="h-3.5 w-3.5" />} label="Нужен QR">
          {order.requires_qr ? (
            <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300">
              Да
            </Badge>
          ) : (
            <span className="text-muted-foreground">Нет</span>
          )}
        </Info>
        <Info icon={<ShoppingBag className="h-3.5 w-3.5" />} label="Маркетплейс">
          {isMarketplace ? (
            <Badge variant="outline" className="border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300">
              {order.marketplace}
            </Badge>
          ) : (
            <span className="text-muted-foreground">Нет</span>
          )}
        </Info>
      </div>

      {/* Поля ввода */}
      <div className="grid gap-3 sm:grid-cols-2">
        {isCash && (
          <ToggleField
            label="Оплата получена"
            value={cashReceived}
            onChange={setCashReceived}
          />
        )}
        {order.requires_qr && (
          <ToggleField label="QR получен" value={qrReceived} onChange={setQrReceived} />
        )}
        <div>
          <div className="mb-1 text-xs text-muted-foreground">Сумма фактически получена</div>
          <Input
            type="number"
            step="0.01"
            inputMode="decimal"
            value={amountReceived}
            onChange={(e) => setAmountReceived(e.target.value)}
            placeholder={order.amount_due != null ? String(order.amount_due) : "0"}
            className="h-8"
          />
        </div>
        <div className="sm:col-span-2">
          <div className="mb-1 text-xs text-muted-foreground">Комментарий</div>
          <Textarea
            value={paymentComment}
            onChange={(e) => setPaymentComment(e.target.value)}
            rows={2}
            placeholder="Комментарий по оплате/QR"
          />
        </div>
      </div>

      {hasMismatch && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">Есть расхождение по оплате</div>
            <div className="opacity-90">
              К получению: {order.amount_due} ₽ · Фактически: {amountNum} ₽ · Разница:{" "}
              {(amountNum! - (order.amount_due ?? 0)).toFixed(2)} ₽
            </div>
          </div>
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} className="gap-1.5">
          <Save className="h-3.5 w-3.5" /> Сохранить оплату
        </Button>
      </div>
    </div>
  );
}

function Info({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-border/60 bg-background p-2">
      <div className="mb-0.5 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-sm font-medium">{children}</div>
    </div>
  );
}

function ToggleField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div className="inline-flex overflow-hidden rounded-md border border-border">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`px-3 py-1 text-xs font-medium ${
            value ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-background text-muted-foreground"
          }`}
        >
          Да
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`px-3 py-1 text-xs font-medium ${
            !value ? "bg-red-500/15 text-red-700 dark:text-red-300" : "bg-background text-muted-foreground"
          }`}
        >
          Нет
        </button>
      </div>
    </div>
  );
}
