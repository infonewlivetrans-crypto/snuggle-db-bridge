import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Pencil, Archive, Eye } from "lucide-react";
import { EntityTableLayout } from "@/components/dispatcher/EntityTableLayout";
import { StatusBadge } from "@/components/dispatcher/StatusBadge";
import { ContactLinks } from "@/components/dispatcher/ContactLinks";
import { DealForm } from "@/components/dispatcher/DealForm";
import { DispatcherPartnerCardBlock } from "@/components/dispatcher/DispatcherPartnerCardBlock";
import { CustomerSendBlock } from "@/components/dispatcher/CustomerSendBlock";
import { DealControlBlock } from "@/components/dispatcher/DealControlBlock";
import { DispatcherDocumentsBlock } from "@/components/dispatcher/DispatcherDocumentsBlock";
import { TimelineBlock } from "@/components/dispatcher/TimelineBlock";
import { dealsApi } from "@/lib/dispatcher/api";
import type { DealDTO } from "@/lib/dispatcher/types";
import type { DealCreateInput } from "@/lib/dispatcher/schemas";
import {
  COMMISSION_STATUS_LABELS, DEAL_STATUSES, DEAL_STATUS_LABELS,
  PAYMENT_STATUSES, PAYMENT_STATUS_LABELS,
  COMMISSION_STATUSES,
  type CommissionStatus, type DealStatus, type PaymentStatus,
} from "@/lib/dispatcher/statuses";

export const Route = createFileRoute("/dispatcher/deals")({
  component: DealsPage,
});

const fmtMoney = (n: number | null | undefined) =>
  n == null ? "—" : `${Number(n).toLocaleString("ru-RU")} ₽`;

function DealsPage() {
  const [rows, setRows] = useState<DealDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [dealStatus, setDealStatus] = useState<string>("all");
  const [paymentStatus, setPaymentStatus] = useState<string>("all");
  const [commissionStatus, setCommissionStatus] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [editing, setEditing] = useState<DealDTO | null>(null);
  const [viewing, setViewing] = useState<DealDTO | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await dealsApi.list({
        search,
        deal_status: dealStatus,
        payment_status: paymentStatus,
        commission_status: commissionStatus,
        date_from: dateFrom,
        date_to: dateTo,
        limit: 200,
      });
      setRows(res.rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, dealStatus, paymentStatus, commissionStatus, dateFrom, dateTo]);

  const handleSubmit = async (data: DealCreateInput) => {
    setSubmitting(true);
    try {
      if (editing) await dealsApi.update(editing.id, data);
      else await dealsApi.create(data);
      toast.success(editing ? "Сделка обновлена" : "Сделка создана");
      setDialogOpen(false);
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = async (id: string) => {
    if (!confirm("Архивировать сделку?")) return;
    try {
      await dealsApi.archive(id);
      toast.success("Архивирована");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const patch = async (id: string, body: Partial<DealCreateInput>, msg: string) => {
    try {
      await dealsApi.update(id, body);
      toast.success(msg);
      await load();
      if (viewing && viewing.id === id) {
        const updated = await dealsApi.get(id);
        setViewing(updated.row);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const today = () => new Date().toISOString().slice(0, 10);

  const markCarrierPaid = (d: DealDTO) =>
    patch(
      d.id,
      {
        carrier_payment_received_at: today(),
        payment_status: "customer_paid_carrier",
        commission_status: "waiting_commission",
      },
      "Отмечено: перевозчик получил оплату",
    );

  const markCommissionReceived = (d: DealDTO) =>
    patch(
      d.id,
      { commission_paid_at: today(), commission_status: "commission_paid" },
      "Отмечено: комиссия получена",
    );

  return (
    <EntityTableLayout
      title="Сделки / Рейсы"
      createLabel="Добавить сделку"
      onCreate={() => {
        setEditing(null);
        setDialogOpen(true);
      }}
      toolbar={
        <>
          <Input placeholder="Поиск" value={search} onChange={(e) => setSearch(e.target.value)} className="w-48" />
          <Select value={dealStatus} onValueChange={setDealStatus}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Статус рейса" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы рейса</SelectItem>
              {DEAL_STATUSES.map((s) => <SelectItem key={s} value={s}>{DEAL_STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={paymentStatus} onValueChange={setPaymentStatus}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Статус оплаты" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы оплаты</SelectItem>
              {PAYMENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{PAYMENT_STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={commissionStatus} onValueChange={setCommissionStatus}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Статус комиссии" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы комиссии</SelectItem>
              {COMMISSION_STATUSES.map((s) => <SelectItem key={s} value={s}>{COMMISSION_STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" title="Дата загрузки от" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" title="Дата загрузки до" />
        </>
      }
    >
      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>№</TableHead>
              <TableHead>Маршрут</TableHead>
              <TableHead>Загрузка</TableHead>
              <TableHead>Перевозчик</TableHead>
              <TableHead>Водитель</TableHead>
              <TableHead>Машина</TableHead>
              <TableHead>Ставка</TableHead>
              <TableHead>Комиссия 5%</TableHead>
              <TableHead>Рейс</TableHead>
              <TableHead>Оплата</TableHead>
              <TableHead>Комиссия</TableHead>
              <TableHead>Ожид. оплата</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={13} className="text-center text-muted-foreground">Загрузка…</TableCell></TableRow>}
            {!loading && rows.length === 0 && <TableRow><TableCell colSpan={13} className="text-center text-muted-foreground">Ничего не найдено</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => setViewing(r)}>
                <TableCell className="font-mono text-xs">{r.deal_number ?? "—"}</TableCell>
                <TableCell className="text-xs">
                  <div className="font-medium">{r.route_from ?? "—"} → {r.route_to ?? "—"}</div>
                  <div className="text-muted-foreground">{r.freight_title ?? ""}</div>
                </TableCell>
                <TableCell className="text-xs">{r.loading_date ?? "—"}</TableCell>
                <TableCell className="text-xs">{r.carrier_name ?? "—"}</TableCell>
                <TableCell className="text-xs">{r.driver_name ?? "—"}</TableCell>
                <TableCell className="text-xs">{r.vehicle_kind ?? "—"}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">{fmtMoney(r.total_rate)}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">{fmtMoney(r.commission_amount)}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Select value={r.deal_status} onValueChange={(v) => patch(r.id, { deal_status: v as DealStatus }, "Статус обновлён")}>
                    <SelectTrigger className="h-7 w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DEAL_STATUSES.map((s) => <SelectItem key={s} value={s}>{DEAL_STATUS_LABELS[s]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Select value={r.payment_status} onValueChange={(v) => patch(r.id, { payment_status: v as PaymentStatus }, "Оплата обновлена")}>
                    <SelectTrigger className="h-7 w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{PAYMENT_STATUS_LABELS[s]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Select value={r.commission_status} onValueChange={(v) => patch(r.id, { commission_status: v as CommissionStatus }, "Комиссия обновлена")}>
                    <SelectTrigger className="h-7 w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COMMISSION_STATUSES.map((s) => <SelectItem key={s} value={s}>{COMMISSION_STATUS_LABELS[s]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-xs">{r.expected_payment_date ?? "—"}</TableCell>
                <TableCell className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  <Button size="icon" variant="ghost" title="Просмотр" onClick={() => setViewing(r)}><Eye className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" title="Редактировать" onClick={() => { setEditing(r); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" title="Архив" onClick={() => handleArchive(r.id)}><Archive className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Редактировать сделку" : "Новая сделка"}</DialogTitle>
            <DialogDescription>Заполните данные сделки и сохраните.</DialogDescription>
          </DialogHeader>
          <DealForm initial={editing} submitting={submitting}
            onCancel={() => { setDialogOpen(false); setEditing(null); }}
            onSubmit={handleSubmit} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(o) => { if (!o) setViewing(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Сделка {viewing?.deal_number ?? ""}</DialogTitle>
            <DialogDescription>Карточка сделки.</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-2 text-sm">
              <DealControlBlock deal={viewing} />
              <Row label="Маршрут" value={`${viewing.route_from ?? "—"} → ${viewing.route_to ?? "—"}`} />
              <Row label="Груз" value={viewing.freight_title ?? "—"} />
              <Row label="Перевозчик" value={viewing.carrier_name ?? "—"} />
              <Row label="Контакты перевозчика" value={
                <ContactLinks phone={viewing.carrier_phone ?? null} whatsapp={viewing.carrier_whatsapp ?? null} telegram={viewing.carrier_telegram ?? null} max_messenger={viewing.carrier_max_messenger ?? null} />
              } />
              <Row label="Водитель" value={viewing.driver_name ?? "—"} />
              <Row label="Контакты водителя" value={
                <ContactLinks phone={viewing.driver_phone ?? null} whatsapp={viewing.driver_whatsapp ?? null} telegram={viewing.driver_telegram ?? null} max_messenger={viewing.driver_max_messenger ?? null} />
              } />
              <Row label="Машина" value={`${viewing.vehicle_kind ?? "—"} ${viewing.vehicle_body_type ? "/ " + viewing.vehicle_body_type : ""}`} />
              <Row label="Загрузка / Выгрузка" value={`${viewing.loading_date ?? "—"} → ${viewing.unloading_date ?? "—"}`} />
              <Row label="Ставка" value={fmtMoney(viewing.total_rate)} />
              <Row label="Комиссия 5%" value={fmtMoney(viewing.commission_amount)} />
              <Row label="Отсрочка" value={viewing.payment_delay_days != null ? `${viewing.payment_delay_days} дн.` : "—"} />
              <Row label="Ожид. дата оплаты" value={viewing.expected_payment_date ?? "—"} />
              <Row label="Перевозчик получил оплату" value={viewing.carrier_payment_received_at ?? "—"} />
              <Row label="Комиссия получена" value={viewing.commission_paid_at ?? "—"} />
              <Row label="Статус рейса" value={<StatusBadge status={viewing.deal_status} label={DEAL_STATUS_LABELS[viewing.deal_status as DealStatus] ?? viewing.deal_status} />} />
              <Row label="Статус оплаты" value={<StatusBadge status={viewing.payment_status} label={PAYMENT_STATUS_LABELS[viewing.payment_status as PaymentStatus] ?? viewing.payment_status} />} />
              <Row label="Статус комиссии" value={<StatusBadge status={viewing.commission_status} label={COMMISSION_STATUS_LABELS[viewing.commission_status as CommissionStatus] ?? viewing.commission_status} />} />
              <Row label="Комментарий" value={viewing.comment ?? "—"} />
              <div className="pt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => patch(viewing.id, { deal_status: "in_transit" }, "В рейсе")}>В рейсе</Button>
                <Button size="sm" variant="outline" onClick={() => patch(viewing.id, { deal_status: "delivered" }, "Выгрузился")}>Выгрузился</Button>
                <Button size="sm" variant="outline" onClick={() => patch(viewing.id, { deal_status: "waiting_payment" }, "Ждём оплату")}>Ждём оплату</Button>
                <Button size="sm" variant="outline" onClick={() => markCarrierPaid(viewing)}>Перевозчик получил оплату</Button>
                <Button size="sm" variant="outline" onClick={() => markCommissionReceived(viewing)}>Комиссия получена</Button>
                <Button size="sm" variant="outline" onClick={() => patch(viewing.id, { deal_status: "problem" }, "Проблема")}>Проблема</Button>
                <Button size="sm" variant="outline" onClick={() => patch(viewing.id, { deal_status: "closed" }, "Закрыта")}>Закрыть</Button>
              </div>

              <div className="pt-4 border-t">
                <CustomerSendBlock
                  dealId={viewing.id}
                  dealStatus={viewing.deal_status}
                  carrierAccepted={!!viewing.carrier_id}
                />
              </div>

              <div className="pt-4 border-t">
                <h4 className="mb-2 text-sm font-semibold">Документы по рейсу</h4>
                <DispatcherDocumentsBlock ownerType="deal" ownerId={viewing.id} />
              </div>

              <div className="pt-4 border-t">
                <TimelineBlock dealId={viewing.id} title="История сделки" />
              </div>



              {viewing.carrier_id ? (
                <div className="pt-4 border-t">
                  <h4 className="mb-2 text-sm font-semibold">Карточка партнёра (расширенная)</h4>
                  <DispatcherPartnerCardBlock
                    carrierExtId={viewing.carrier_id}
                    initialDriverId={viewing.driver_id ?? null}
                    initialVehicleId={viewing.vehicle_id ?? null}
                    initialDealId={viewing.id}
                  />
                </div>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </EntityTableLayout>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="w-56 text-muted-foreground">{label}</div>
      <div className="flex-1">{value}</div>
    </div>
  );
}
