import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DEAL_STATUS_LABELS,
  type DealStatus,
} from "@/lib/dispatcher/statuses";
import { StatusBadge } from "@/components/dispatcher/StatusBadge";
import { dealsApi, type DealStatusUpdateInput } from "@/lib/dispatcher/api";
import type { DealDTO } from "@/lib/dispatcher/types";

const fmt = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("ru-RU") : "—";
const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("ru-RU") : "—";
const fmtMoney = (n: number | null | undefined) =>
  n == null ? "—" : `${Number(n).toLocaleString("ru-RU")} ₽`;

interface QuickAction {
  status: DealStatus;
  label: string;
  variant?: "default" | "outline" | "destructive" | "secondary";
}

const QUICK_ACTIONS: QuickAction[] = [
  { status: "customer_sent", label: "Данные заказчику отправлены" },
  { status: "customer_confirmed", label: "Заказчик подтвердил" },
  { status: "loading", label: "Загрузка" },
  { status: "in_transit", label: "В пути" },
  { status: "unloading", label: "Выгрузка" },
  { status: "delivered", label: "Доставлено" },
  { status: "waiting_customer_payment", label: "Ждём оплату" },
  { status: "waiting_commission", label: "Ждём комиссию" },
  { status: "commission_received", label: "Комиссия получена" },
  { status: "closed", label: "Закрыть сделку", variant: "secondary" },
  { status: "cancelled", label: "Отменить", variant: "destructive" },
];

interface Props {
  deal: DealDTO;
}

export function DealControlBlock({ deal }: Props) {
  const qc = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [nextAction, setNextAction] = useState(deal.dispatcher_next_action ?? "");
  const [paymentDue, setPaymentDue] = useState(deal.customer_payment_due_date ?? "");
  const [commissionDue, setCommissionDue] = useState(deal.commission_due_date ?? "");

  const mutate = useMutation({
    mutationFn: (body: DealStatusUpdateInput) =>
      dealsApi.updateStatus(deal.id, body),
    onSuccess: (res) => {
      toast.success("Статус обновлён");
      if (res.created_task) toast.info(`Создана задача: ${res.created_task.title}`);
      qc.invalidateQueries({ queryKey: ["dispatcher-deals"] });
      qc.invalidateQueries({ queryKey: ["dispatcher-dashboard"] });
      qc.invalidateQueries({ queryKey: ["dispatcher-deal-control", deal.id] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Не удалось сменить статус"),
  });

  const apply = (status: DealStatus) => {
    if (status === "cancelled") {
      setCancelOpen(true);
      return;
    }
    mutate.mutate({ deal_status: status });
  };

  const submitMeta = () => {
    mutate.mutate({
      deal_status: deal.deal_status,
      customer_payment_due_date: paymentDue || null,
      commission_due_date: commissionDue || null,
      dispatcher_next_action: nextAction || null,
    });
  };

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card/50 p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Контроль сделки</h4>
        <StatusBadge
          status={deal.deal_status}
          label={
            DEAL_STATUS_LABELS[deal.deal_status as DealStatus] ?? deal.deal_status
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div className="text-muted-foreground">Маршрут</div>
        <div>{(deal.route_from ?? "—") + " → " + (deal.route_to ?? "—")}</div>
        <div className="text-muted-foreground">Перевозчик</div>
        <div>{deal.carrier_name ?? "—"}</div>
        <div className="text-muted-foreground">Водитель</div>
        <div>{deal.driver_name ?? "—"}</div>
        <div className="text-muted-foreground">Транспорт</div>
        <div>
          {[deal.vehicle_kind, deal.vehicle_body_type].filter(Boolean).join(" / ") ||
            "—"}
        </div>
        <div className="text-muted-foreground">Ставка</div>
        <div>{fmtMoney(deal.total_rate)}</div>
        <div className="text-muted-foreground">Комиссия</div>
        <div>{fmtMoney(deal.commission_amount)}</div>
      </div>

      {/* Timeline */}
      <div className="rounded border border-border bg-background p-2 text-xs">
        <div className="mb-1 font-medium">Этапы</div>
        <ul className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
          <li>
            <span className="text-muted-foreground">Заказчику отправлено: </span>
            {fmt(deal.customer_sent_at)}
          </li>
          <li>
            <span className="text-muted-foreground">Заказчик подтвердил: </span>
            {fmt(deal.customer_confirmed_at)}
          </li>
          <li>
            <span className="text-muted-foreground">Загрузка: </span>
            {fmt(deal.loading_started_at)}
          </li>
          <li>
            <span className="text-muted-foreground">В пути: </span>
            {fmt(deal.in_transit_at)}
          </li>
          <li>
            <span className="text-muted-foreground">Выгрузка: </span>
            {fmt(deal.unloading_started_at)}
          </li>
          <li>
            <span className="text-muted-foreground">Доставлено: </span>
            {fmt(deal.delivered_at)}
          </li>
          <li>
            <span className="text-muted-foreground">Оплата получена: </span>
            {fmt(deal.customer_paid_at)}
          </li>
          <li>
            <span className="text-muted-foreground">Комиссия получена: </span>
            {fmt(deal.commission_received_at)}
          </li>
          <li>
            <span className="text-muted-foreground">Закрыто: </span>
            {fmt(deal.deal_closed_at)}
          </li>
        </ul>
      </div>

      {/* Plan */}
      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <Label className="text-xs">Срок оплаты заказчиком</Label>
          <Input
            type="date"
            value={paymentDue ?? ""}
            onChange={(e) => setPaymentDue(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Срок комиссии</Label>
          <Input
            type="date"
            value={commissionDue ?? ""}
            onChange={(e) => setCommissionDue(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Следующий шаг</Label>
          <Input
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            placeholder="Что делаем дальше"
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={submitMeta} disabled={mutate.isPending}>
          Сохранить план
        </Button>
      </div>

      {deal.cancel_reason ? (
        <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs">
          <Badge variant="destructive" className="mr-2">Причина отмены</Badge>
          {deal.cancel_reason}
        </div>
      ) : null}

      {/* Quick actions */}
      <div>
        <div className="mb-1 text-xs font-medium text-muted-foreground">
          Быстрые действия
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_ACTIONS.map((a) => (
            <Button
              key={a.status}
              size="sm"
              variant={a.variant ?? "outline"}
              disabled={mutate.isPending || deal.deal_status === a.status}
              onClick={() => apply(a.status)}
            >
              {a.label}
            </Button>
          ))}
        </div>
      </div>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Отменить сделку</DialogTitle>
            <DialogDescription>
              Укажите причину отмены. Текущая дата отмены будет зафиксирована.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Например: заказчик отменил, машина сломалась, перевозчик отказался"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Назад
            </Button>
            <Button
              variant="destructive"
              disabled={!cancelReason.trim() || mutate.isPending}
              onClick={() => {
                mutate.mutate({
                  deal_status: "cancelled",
                  cancel_reason: cancelReason.trim(),
                });
                setCancelOpen(false);
                setCancelReason("");
              }}
            >
              Отменить сделку
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="text-xs text-muted-foreground">
        Срок оплаты:{" "}
        <strong>{fmtDate(deal.customer_payment_due_date)}</strong> · Срок комиссии:{" "}
        <strong>{fmtDate(deal.commission_due_date)}</strong>
        {deal.dispatcher_next_action ? (
          <>
            {" "}
            · Следующий шаг: <strong>{deal.dispatcher_next_action}</strong>
          </>
        ) : null}
      </div>
    </section>
  );
}
