import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { EntityTableLayout } from "@/components/dispatcher/EntityTableLayout";
import { StatusBadge } from "@/components/dispatcher/StatusBadge";
import { dealsApi } from "@/lib/dispatcher/api";
import type { DealDTO } from "@/lib/dispatcher/types";
import {
  COMMISSION_STATUS_LABELS, PAYMENT_STATUS_LABELS,
  type CommissionStatus, type PaymentStatus,
} from "@/lib/dispatcher/statuses";

export const Route = createFileRoute("/dispatcher/commissions")({
  component: CommissionsPage,
});

const fmtMoney = (n: number | null | undefined) =>
  n == null ? "—" : `${Number(n).toLocaleString("ru-RU")} ₽`;

type Tab = "all" | "waiting_customer" | "waiting_commission" | "overdue" | "paid" | "dispute";

function CommissionsPage() {
  const [rows, setRows] = useState<DealDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await dealsApi.list({ search, limit: 500 });
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
  }, [search]);

  const today = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const isOverdue =
        !!r.expected_payment_date &&
        r.expected_payment_date < today &&
        r.commission_status !== "commission_paid" &&
        r.commission_status !== "closed";
      switch (tab) {
        case "waiting_customer": return r.payment_status === "waiting_customer_payment";
        case "waiting_commission": return r.commission_status === "waiting_commission";
        case "overdue": return isOverdue;
        case "paid": return r.commission_status === "commission_paid";
        case "dispute": return r.commission_status === "dispute" || r.payment_status === "dispute";
        default: return r.deal_status !== "archived";
      }
    });
  }, [rows, tab, today]);

  const patch = async (id: string, body: Record<string, unknown>, msg: string) => {
    try {
      await dealsApi.update(id, body);
      toast.success(msg);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const todayStr = () => new Date().toISOString().slice(0, 10);

  const markCarrierPaid = (d: DealDTO) =>
    patch(d.id, {
      carrier_payment_received_at: todayStr(),
      payment_status: "customer_paid_carrier",
      commission_status: "waiting_commission",
    }, "Отмечено: перевозчик получил оплату");

  const markCommissionReceived = (d: DealDTO) =>
    patch(d.id, {
      commission_paid_at: todayStr(),
      commission_status: "commission_paid",
    }, "Отмечено: комиссия получена");

  const remind = (d: DealDTO) => {
    const phone = d.carrier_phone || d.driver_phone;
    if (phone) {
      window.open(`tel:${phone.replace(/\s+/g, "")}`, "_self");
    } else {
      toast.info("Контактный телефон не указан");
    }
  };

  const daysDelta = (d: DealDTO): { days: number; overdue: boolean } | null => {
    if (!d.expected_payment_date) return null;
    const exp = new Date(`${d.expected_payment_date}T00:00:00Z`).getTime();
    const now = new Date(`${today}T00:00:00Z`).getTime();
    const days = Math.round((exp - now) / (1000 * 60 * 60 * 24));
    return { days: Math.abs(days), overdue: days < 0 };
  };

  return (
    <EntityTableLayout
      title="Комиссии"
      toolbar={
        <>
          <Input placeholder="Поиск" value={search} onChange={(e) => setSearch(e.target.value)} className="w-48" />
          <Select value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все сделки</SelectItem>
              <SelectItem value="waiting_customer">Ждём оплату заказчика</SelectItem>
              <SelectItem value="waiting_commission">Ждём комиссию</SelectItem>
              <SelectItem value="overdue">Просрочено</SelectItem>
              <SelectItem value="paid">Комиссия получена</SelectItem>
              <SelectItem value="dispute">Спор</SelectItem>
            </SelectContent>
          </Select>
        </>
      }
    >
      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>№</TableHead>
              <TableHead>Перевозчик</TableHead>
              <TableHead>Водитель</TableHead>
              <TableHead>Маршрут</TableHead>
              <TableHead>Ставка</TableHead>
              <TableHead>Комиссия 5%</TableHead>
              <TableHead>Ожид. оплата</TableHead>
              <TableHead>Срок</TableHead>
              <TableHead>Оплата</TableHead>
              <TableHead>Комиссия</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground">Загрузка…</TableCell></TableRow>}
            {!loading && filtered.length === 0 && <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground">Ничего не найдено</TableCell></TableRow>}
            {filtered.map((r) => {
              const dd = daysDelta(r);
              const overdue =
                !!r.expected_payment_date &&
                r.expected_payment_date < today &&
                r.commission_status !== "commission_paid" &&
                r.commission_status !== "closed";
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.deal_number ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.carrier_name ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.driver_name ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.route_from ?? "—"} → {r.route_to ?? "—"}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{fmtMoney(r.total_rate)}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap font-medium">{fmtMoney(r.commission_amount)}</TableCell>
                  <TableCell className="text-xs">{r.expected_payment_date ?? "—"}</TableCell>
                  <TableCell className={`text-xs ${overdue ? "text-red-600 font-medium" : ""}`}>
                    {dd == null ? "—" : dd.overdue ? `просрочено ${dd.days} дн.` : `через ${dd.days} дн.`}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.payment_status} label={PAYMENT_STATUS_LABELS[r.payment_status as PaymentStatus] ?? r.payment_status} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.commission_status} label={COMMISSION_STATUS_LABELS[r.commission_status as CommissionStatus] ?? r.commission_status} />
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button size="sm" variant="outline" className="mr-1" onClick={() => markCarrierPaid(r)}>Перевозчик получил оплату</Button>
                    <Button size="sm" variant="outline" className="mr-1" onClick={() => markCommissionReceived(r)}>Комиссия получена</Button>
                    <Button size="sm" variant="ghost" className="mr-1" onClick={() => remind(r)}>Напомнить</Button>
                    <Link to="/dispatcher/deals" className="text-xs underline">Открыть сделку</Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </EntityTableLayout>
  );
}
