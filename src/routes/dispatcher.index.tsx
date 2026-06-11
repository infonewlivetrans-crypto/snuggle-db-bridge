import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Truck,
  PackageSearch,
  Handshake,
  Wallet,
  Coins,
  AlertTriangle,
  ClipboardList,
  ArrowRight,
} from "lucide-react";
import { dashboardApi, dealsApi, type DashboardResponse } from "@/lib/dispatcher/api";
import type { DealDTO } from "@/lib/dispatcher/types";
import {
  DEAL_STATUS_LABELS,
  type DealStatus,
} from "@/lib/dispatcher/statuses";
import { FreeVehiclesBlock } from "@/components/dispatcher/FreeVehiclesBlock";
import { AcceptedOffersBlock } from "@/components/dispatcher/AcceptedOffersBlock";

export const Route = createFileRoute("/dispatcher/")({
  component: DispatcherHome,
});

const fmtMoney = (n: number | null | undefined) =>
  n == null ? "—" : `${Number(n).toLocaleString("ru-RU")} ₽`;
const fmtDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("ru-RU") : "—");
const fmtNum = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("ru-RU");

function daysBetween(a: string, b: string): number {
  const da = new Date(a);
  const db = new Date(b);
  return Math.round((da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24));
}

function DispatcherHome() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["dispatcher-dashboard"],
    queryFn: () => dashboardApi.get(),
    refetchInterval: 60_000,
  });

  const [busyId, setBusyId] = useState<string | null>(null);

  const today = data?.today ?? new Date().toISOString().slice(0, 10);

  async function markPaymentReceived(id: string) {
    if (busyId) return;
    setBusyId(id);
    try {
      await dealsApi.update(id, {
        payment_status: "customer_paid_carrier",
        commission_status: "waiting_commission",
        carrier_payment_received_at: new Date().toISOString(),
      });
      toast.success("Отмечено: перевозчик получил оплату");
      qc.invalidateQueries({ queryKey: ["dispatcher-dashboard"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusyId(null);
    }
  }

  async function markCommissionReceived(id: string) {
    if (busyId) return;
    setBusyId(id);
    try {
      await dealsApi.update(id, {
        commission_status: "commission_paid",
        commission_paid_at: new Date().toISOString(),
      });
      toast.success("Комиссия получена");
      qc.invalidateQueries({ queryKey: ["dispatcher-dashboard"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">AI-диспетчер</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Рабочая доска на сегодня — машины, грузы, сделки и комиссии
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="default" size="sm">
              <Link to="/dispatcher/tasks">Все задачи</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/dispatcher/vehicles">Все машины</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/dispatcher/freights">Все грузы</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/dispatcher/deals">Все сделки</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/dispatcher/commissions">Все комиссии</Link>
            </Button>
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            Ошибка загрузки: {error instanceof Error ? error.message : String(error)}
          </div>
        ) : null}

        {/* KPI */}
        <KpiRow data={data} loading={isLoading} />

        {/* Tasks */}
        <Section
          title="Задачи на сегодня"
          icon={<ClipboardList className="h-5 w-5" />}
          count={data?.todayTasks.length ?? 0}
        >
          {(data?.todayTasks ?? []).length === 0 ? (
            <Empty text="Нет задач — всё под контролем" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data!.todayTasks.map((t) => (
                <div
                  key={t.id}
                  className="rounded-lg border border-border bg-card p-3"
                >
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {taskTypeLabel(t.type)}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-foreground">
                    {t.title}
                  </div>
                  {t.target_label ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t.target_label}
                    </div>
                  ) : null}
                  <div className="mt-3">
                    <Button asChild size="sm" variant="secondary">
                      <Link to={t.action_href}>
                        {t.action_label}
                        <ArrowRight className="ml-1 h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Free vehicles workboard (Stage 11) */}
        <FreeVehiclesBlock />

        {/* Active freights */}
        <Section
          title="Найденные грузы"
          icon={<PackageSearch className="h-5 w-5" />}
          count={data?.activeFreights.length ?? 0}
          linkTo="/dispatcher/freights"
        >
          {(data?.activeFreights ?? []).length === 0 ? (
            <Empty text="Активных грузов нет" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data!.activeFreights.slice(0, 9).map((f) => (
                <FreightCard key={String(f.id)} f={f} />
              ))}
            </div>
          )}
        </Section>

        {/* Active deals */}
        <Section
          title="Активные сделки"
          icon={<Handshake className="h-5 w-5" />}
          count={data?.activeDeals.length ?? 0}
          linkTo="/dispatcher/deals"
        >
          {(data?.activeDeals ?? []).length === 0 ? (
            <Empty text="Активных сделок нет" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data!.activeDeals.slice(0, 9).map((d) => (
                <DealCard key={d.id} d={d} />
              ))}
            </div>
          )}
        </Section>

        {/* Waiting payments */}
        <Section
          title="Ждём оплату"
          icon={<Wallet className="h-5 w-5" />}
          count={data?.waitingPayments.length ?? 0}
          linkTo="/dispatcher/commissions"
        >
          {(data?.waitingPayments ?? []).length === 0 ? (
            <Empty text="Все оплачено" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data!.waitingPayments.slice(0, 9).map((d) => (
                <WaitingPaymentCard
                  key={d.id}
                  d={d}
                  today={today}
                  busy={busyId === d.id}
                  onMarkPaid={() => markPaymentReceived(d.id)}
                />
              ))}
            </div>
          )}
        </Section>

        {/* Waiting commissions */}
        <Section
          title="Ждём комиссию"
          icon={<Coins className="h-5 w-5" />}
          count={data?.waitingCommissions.length ?? 0}
          linkTo="/dispatcher/commissions"
        >
          {(data?.waitingCommissions ?? []).length === 0 ? (
            <Empty text="Нет ожидаемых комиссий" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data!.waitingCommissions.slice(0, 9).map((d) => (
                <WaitingCommissionCard
                  key={d.id}
                  d={d}
                  busy={busyId === d.id}
                  onMarkPaid={() => markCommissionReceived(d.id)}
                />
              ))}
            </div>
          )}
        </Section>

        {/* Overdue */}
        <Section
          title="Просрочено"
          icon={<AlertTriangle className="h-5 w-5 text-destructive" />}
          count={data?.overdueCommissions.length ?? 0}
          linkTo="/dispatcher/commissions"
          tone="danger"
        >
          {(data?.overdueCommissions ?? []).length === 0 ? (
            <Empty text="Просрочек нет" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data!.overdueCommissions.slice(0, 9).map((d) => (
                <OverdueCard key={d.id} d={d} today={today} />
              ))}
            </div>
          )}
        </Section>
      </main>
    </div>
  );
}

function taskTypeLabel(t: string): string {
  switch (t) {
    case "overdue":
      return "Просрочка";
    case "waiting_commission":
      return "Комиссия";
    case "waiting_payment":
      return "Оплата";
    case "check_vehicles":
      return "Подбор машин";
    case "find_freight":
      return "Свободная машина";
    default:
      return "Задача";
  }
}

function KpiRow({
  data,
  loading,
}: {
  data: DashboardResponse | undefined;
  loading: boolean;
}) {
  const items = useMemo(
    () => [
      { label: "Свободные машины", value: data?.kpis.available_vehicles_count ?? 0, fmt: fmtNum },
      { label: "Найденные грузы", value: data?.kpis.active_freights_count ?? 0, fmt: fmtNum },
      { label: "Активные сделки", value: data?.kpis.active_deals_count ?? 0, fmt: fmtNum },
      {
        label: "К получению",
        value: data?.kpis.commissions_to_receive_sum ?? 0,
        fmt: fmtMoney,
      },
      {
        label: "Просрочено",
        value: data?.kpis.overdue_sum ?? 0,
        fmt: fmtMoney,
        danger: (data?.kpis.overdue_sum ?? 0) > 0,
      },
      {
        label: "Комиссии за месяц",
        value: data?.kpis.received_month_sum ?? 0,
        fmt: fmtMoney,
      },
    ],
    [data],
  );
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((it) => (
        <div
          key={it.label}
          className={
            "rounded-lg border p-3 " +
            (it.danger
              ? "border-destructive/40 bg-destructive/5"
              : "border-border bg-card")
          }
        >
          <div className="text-xs text-muted-foreground">{it.label}</div>
          <div
            className={
              "mt-1 text-xl font-bold tabular-nums " +
              (it.danger ? "text-destructive" : "text-foreground")
            }
          >
            {loading ? "…" : it.fmt(it.value as number)}
          </div>
        </div>
      ))}
    </div>
  );
}

function Section({
  title,
  icon,
  count,
  linkTo,
  tone,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  linkTo?: string;
  tone?: "danger";
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          {icon}
          <span>{title}</span>
          <Badge
            variant="outline"
            className={
              tone === "danger" && count > 0
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : ""
            }
          >
            {count}
          </Badge>
        </h2>
        {linkTo ? (
          <Button asChild variant="ghost" size="sm">
            <Link to={linkTo}>
              Все
              <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function VehicleCard({ v }: { v: Record<string, unknown> }) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-3">
      <div className="text-sm font-semibold text-foreground">
        {(v.vehicle_kind as string) ?? "—"}
        {v.body_type ? <span className="text-muted-foreground"> · {v.body_type as string}</span> : null}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
        <div>Г/п: {fmtNum(v.payload_kg as number | null)} кг</div>
        <div>V: {fmtNum(v.volume_m3 as number | null)} м³</div>
        <div>Город: {(v.home_city as string) ?? "—"}</div>
        <div>Готов: {fmtDate(v.ready_date as string | null)}</div>
        <div>Водитель: {(v.driver_name as string) ?? "—"}</div>
        <div>Перевозчик: {(v.carrier_name as string) ?? "—"}</div>
        <div>₽/км: {fmtNum(v.minimum_km_rate as number | null)}</div>
        <div>₽/рейс: {fmtNum(v.minimum_trip_rate as number | null)}</div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button asChild size="sm" variant="secondary" className="flex-1">
          <Link to="/dispatcher/freights">Найти груз</Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="flex-1">
          <Link to="/dispatcher/vehicles">Открыть</Link>
        </Button>
      </div>
    </div>
  );
}

function FreightCard({ f }: { f: Record<string, unknown> }) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-3">
      <div className="text-sm font-semibold text-foreground">
        {(f.loading_city as string) ?? "—"} → {(f.unloading_city as string) ?? "—"}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
        <div>Загрузка: {fmtDate(f.loading_date as string | null)}</div>
        <div>Кузов: {(f.body_type as string) ?? "—"}</div>
        <div>Груз: {(f.cargo_name as string) ?? "—"}</div>
        <div>Ставка: {fmtMoney(f.rate as number | null)}</div>
        <div>Вес: {fmtNum(f.weight_kg as number | null)} кг</div>
        <div>V: {fmtNum(f.volume_m3 as number | null)} м³</div>
        <div className="col-span-2">Источник: {(f.source as string) ?? "—"}</div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button asChild size="sm" variant="secondary" className="flex-1">
          <Link to="/dispatcher/freights">Проверить машины</Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="flex-1">
          <Link to="/dispatcher/freights">Открыть</Link>
        </Button>
      </div>
    </div>
  );
}

function DealCard({ d }: { d: DealDTO }) {
  const status = d.deal_status as DealStatus;
  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-foreground">{d.deal_number ?? "—"}</div>
        <Badge variant="outline">{DEAL_STATUS_LABELS[status] ?? status}</Badge>
      </div>
      <div className="mt-1 text-sm text-foreground">
        {d.route_from ?? "—"} → {d.route_to ?? "—"}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
        <div>Водитель: {d.driver_name ?? "—"}</div>
        <div>Перевозчик: {d.carrier_name ?? "—"}</div>
        <div>Ставка: {fmtMoney(d.total_rate)}</div>
        <div>Комиссия: {fmtMoney(d.commission_amount)}</div>
      </div>
      <div className="mt-3">
        <Button asChild size="sm" variant="outline" className="w-full">
          <Link to="/dispatcher/deals">Открыть сделку</Link>
        </Button>
      </div>
    </div>
  );
}

function WaitingPaymentCard({
  d,
  today,
  busy,
  onMarkPaid,
}: {
  d: DealDTO;
  today: string;
  busy: boolean;
  onMarkPaid: () => void;
}) {
  const daysLeft = d.expected_payment_date
    ? daysBetween(d.expected_payment_date, today)
    : null;
  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-3">
      <div className="text-sm font-semibold text-foreground">{d.carrier_name ?? "—"}</div>
      <div className="mt-1 text-sm text-foreground">
        {d.route_from ?? "—"} → {d.route_to ?? "—"}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
        <div>Ставка: {fmtMoney(d.total_rate)}</div>
        <div>Комиссия: {fmtMoney(d.commission_amount)}</div>
        <div>Ждём до: {fmtDate(d.expected_payment_date)}</div>
        <div>
          {daysLeft == null
            ? "—"
            : daysLeft >= 0
              ? `Осталось ${daysLeft} дн.`
              : `Просрочка ${Math.abs(daysLeft)} дн.`}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" className="flex-1" disabled={busy} onClick={onMarkPaid}>
          Перевозчик получил
        </Button>
        <Button asChild size="sm" variant="outline" className="flex-1">
          <Link to="/dispatcher/deals">Открыть</Link>
        </Button>
      </div>
    </div>
  );
}

function WaitingCommissionCard({
  d,
  busy,
  onMarkPaid,
}: {
  d: DealDTO;
  busy: boolean;
  onMarkPaid: () => void;
}) {
  const reminderHref = d.carrier_max_messenger
    ? `https://max.ru/${d.carrier_max_messenger}`
    : d.carrier_whatsapp
      ? `https://wa.me/${d.carrier_whatsapp.replace(/\D/g, "")}`
      : d.carrier_telegram
        ? `https://t.me/${d.carrier_telegram.replace(/^@/, "")}`
        : d.carrier_phone
          ? `tel:${d.carrier_phone}`
          : null;
  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-3">
      <div className="text-sm font-semibold text-foreground">{d.carrier_name ?? "—"}</div>
      <div className="mt-1 text-xs text-muted-foreground">Водитель: {d.driver_name ?? "—"}</div>
      <div className="mt-1 text-sm text-foreground">
        {d.route_from ?? "—"} → {d.route_to ?? "—"}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
        <div>Комиссия: {fmtMoney(d.commission_amount)}</div>
        <div>Оплата получена: {fmtDate(d.carrier_payment_received_at)}</div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" className="flex-1" disabled={busy} onClick={onMarkPaid}>
          Комиссия получена
        </Button>
        {reminderHref ? (
          <Button asChild size="sm" variant="outline">
            <a href={reminderHref} target="_blank" rel="noreferrer">
              Напомнить
            </a>
          </Button>
        ) : null}
        <Button asChild size="sm" variant="outline">
          <Link to="/dispatcher/deals">Открыть</Link>
        </Button>
      </div>
    </div>
  );
}

function OverdueCard({ d, today }: { d: DealDTO; today: string }) {
  const overdueDays = d.expected_payment_date
    ? Math.abs(daysBetween(d.expected_payment_date, today))
    : null;
  const reminderHref = d.carrier_max_messenger
    ? `https://max.ru/${d.carrier_max_messenger}`
    : d.carrier_whatsapp
      ? `https://wa.me/${d.carrier_whatsapp.replace(/\D/g, "")}`
      : d.carrier_telegram
        ? `https://t.me/${d.carrier_telegram.replace(/^@/, "")}`
        : d.carrier_phone
          ? `tel:${d.carrier_phone}`
          : null;
  return (
    <div className="flex flex-col rounded-lg border border-destructive/40 bg-destructive/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-foreground">{d.carrier_name ?? "—"}</div>
        {overdueDays != null ? (
          <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
            +{overdueDays} дн.
          </Badge>
        ) : null}
      </div>
      <div className="mt-1 text-sm text-foreground">
        {d.route_from ?? "—"} → {d.route_to ?? "—"}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
        <div>Комиссия: {fmtMoney(d.commission_amount)}</div>
        <div>Оплата: {d.payment_status}</div>
        <div className="col-span-2">Комиссия-статус: {d.commission_status}</div>
      </div>
      <div className="mt-3 flex gap-2">
        {reminderHref ? (
          <Button asChild size="sm" className="flex-1">
            <a href={reminderHref} target="_blank" rel="noreferrer">
              Напомнить
            </a>
          </Button>
        ) : null}
        <Button asChild size="sm" variant="outline" className="flex-1">
          <Link to="/dispatcher/deals">Открыть</Link>
        </Button>
      </div>
    </div>
  );
}
