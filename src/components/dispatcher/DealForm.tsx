import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  COMMISSION_STATUSES, COMMISSION_STATUS_LABELS,
  DEAL_STATUSES, DEAL_STATUS_LABELS,
  PAYMENT_STATUSES, PAYMENT_STATUS_LABELS,
  PAYMENT_TYPES, PAYMENT_TYPE_LABELS,
  type CommissionStatus, type DealStatus, type PaymentStatus, type PaymentType,
} from "@/lib/dispatcher/statuses";
import type { DealDTO } from "@/lib/dispatcher/types";
import type { DealCreateInput } from "@/lib/dispatcher/schemas";

interface Props {
  initial?: DealDTO | null;
  submitting?: boolean;
  onCancel: () => void;
  onSubmit: (data: DealCreateInput) => void;
}

const empty = (v: string | null | undefined): string => (v == null ? "" : v);
const numStr = (n: number | null | undefined): string => (n == null ? "" : String(n));
const toNum = (s: string): number | null => {
  if (!s.trim()) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const dateStr = (v: string | null | undefined): string => (v ? String(v).slice(0, 10) : "");

export function DealForm({ initial, submitting, onCancel, onSubmit }: Props) {
  const [routeFrom, setRouteFrom] = useState("");
  const [routeTo, setRouteTo] = useState("");
  const [loadingDate, setLoadingDate] = useState("");
  const [unloadingDate, setUnloadingDate] = useState("");
  const [totalRate, setTotalRate] = useState("");
  const [commissionRate, setCommissionRate] = useState("5");
  const [paymentType, setPaymentType] = useState<string>("none");
  const [paymentDelay, setPaymentDelay] = useState("");
  const [expectedPaymentDate, setExpectedPaymentDate] = useState("");
  const [dealStatus, setDealStatus] = useState<DealStatus>("draft");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("waiting_customer_payment");
  const [commissionStatus, setCommissionStatus] = useState<CommissionStatus>("accrued");
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (!initial) return;
    setRouteFrom(empty(initial.route_from));
    setRouteTo(empty(initial.route_to));
    setLoadingDate(dateStr(initial.loading_date));
    setUnloadingDate(dateStr(initial.unloading_date));
    setTotalRate(numStr(initial.total_rate));
    {
      const dec = toNum(numStr(initial.commission_rate));
      setCommissionRate(dec != null ? String(Math.round(dec * 100 * 100) / 100) : "5");
    }
    setPaymentType(initial.payment_type ?? "none");
    setPaymentDelay(numStr(initial.payment_delay_days));
    setExpectedPaymentDate(dateStr(initial.expected_payment_date));
    setDealStatus(
      (DEAL_STATUSES as readonly string[]).includes(initial.deal_status)
        ? (initial.deal_status as DealStatus)
        : "draft",
    );
    setPaymentStatus(
      (PAYMENT_STATUSES as readonly string[]).includes(initial.payment_status)
        ? (initial.payment_status as PaymentStatus)
        : "waiting_customer_payment",
    );
    setCommissionStatus(
      (COMMISSION_STATUSES as readonly string[]).includes(initial.commission_status)
        ? (initial.commission_status as CommissionStatus)
        : "accrued",
    );
    setComment(empty(initial.comment));
  }, [initial]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: DealCreateInput = {
      main_freight_id: initial?.main_freight_id ?? null,
      carrier_id: initial?.carrier_id ?? null,
      driver_id: initial?.driver_id ?? null,
      vehicle_id: initial?.vehicle_id ?? null,
      deal_number: initial?.deal_number ?? null,
      route_from: routeFrom || null,
      route_to: routeTo || null,
      loading_date: loadingDate || null,
      unloading_date: unloadingDate || null,
      total_rate: toNum(totalRate),
      commission_rate: ((toNum(commissionRate) ?? 5) / 100),
      payment_type: paymentType === "none" ? null : (paymentType as PaymentType),
      payment_delay_days: toNum(paymentDelay),
      expected_payment_date: expectedPaymentDate || null,
      payment_due: expectedPaymentDate || null,
      carrier_payment_received_at: initial?.carrier_payment_received_at ?? null,
      commission_paid_at: initial?.commission_paid_at ?? null,
      deal_status: dealStatus,
      payment_status: paymentStatus,
      commission_status: commissionStatus,
      comment: comment || null,
    };
    onSubmit(data);
  };

  const rate = toNum(totalRate) ?? 0;
  const cRate = toNum(commissionRate) ?? 0.05;
  const calc = Math.round(rate * cRate * 100) / 100;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label>Откуда</Label>
          <Input value={routeFrom} onChange={(e) => setRouteFrom(e.target.value)} />
        </div>
        <div>
          <Label>Куда</Label>
          <Input value={routeTo} onChange={(e) => setRouteTo(e.target.value)} />
        </div>
        <div>
          <Label>Дата загрузки</Label>
          <Input type="date" value={loadingDate} onChange={(e) => setLoadingDate(e.target.value)} />
        </div>
        <div>
          <Label>Дата выгрузки</Label>
          <Input type="date" value={unloadingDate} onChange={(e) => setUnloadingDate(e.target.value)} />
        </div>
        <div>
          <Label>Ставка перевозки, ₽</Label>
          <Input value={totalRate} onChange={(e) => setTotalRate(e.target.value)} inputMode="decimal" />
        </div>
        <div>
          <Label>Комиссия (0..1)</Label>
          <Input value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)} inputMode="decimal" />
          <div className="text-xs text-muted-foreground mt-1">Расчёт: {calc.toLocaleString("ru-RU")} ₽</div>
        </div>
        <div>
          <Label>Тип оплаты</Label>
          <Select value={paymentType} onValueChange={setPaymentType}>
            <SelectTrigger><SelectValue placeholder="Не указано" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Не указано</SelectItem>
              {PAYMENT_TYPES.map((p) => <SelectItem key={p} value={p}>{PAYMENT_TYPE_LABELS[p]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Отсрочка, дни</Label>
          <Input value={paymentDelay} onChange={(e) => setPaymentDelay(e.target.value)} inputMode="numeric" />
        </div>
        <div>
          <Label>Ожидаемая дата оплаты</Label>
          <Input type="date" value={expectedPaymentDate} onChange={(e) => setExpectedPaymentDate(e.target.value)} />
        </div>
        <div>
          <Label>Статус рейса</Label>
          <Select value={dealStatus} onValueChange={(v) => setDealStatus(v as DealStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DEAL_STATUSES.map((s) => <SelectItem key={s} value={s}>{DEAL_STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Статус оплаты</Label>
          <Select value={paymentStatus} onValueChange={(v) => setPaymentStatus(v as PaymentStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAYMENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{PAYMENT_STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Статус комиссии</Label>
          <Select value={commissionStatus} onValueChange={(v) => setCommissionStatus(v as CommissionStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {COMMISSION_STATUSES.map((s) => <SelectItem key={s} value={s}>{COMMISSION_STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Комментарий</Label>
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Отмена</Button>
        <Button type="submit" disabled={submitting}>{submitting ? "Сохранение…" : "Сохранить"}</Button>
      </div>
    </form>
  );
}
