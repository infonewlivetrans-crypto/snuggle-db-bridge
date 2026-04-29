import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DELIVERY_ROUTE_STATUS_LABELS,
  DELIVERY_ROUTE_STATUS_STYLES,
  type DeliveryRouteStatus,
} from "@/lib/deliveryRoutes";
import {
  BarChart3,
  Truck,
  CheckCircle2,
  XCircle,
  Undo2,
  Wallet,
  AlertTriangle,
  QrCode,
  CreditCard,
  PhoneOff,
  Ban,
  PackageX,
} from "lucide-react";

export const Route = createFileRoute("/director")({
  head: () => ({
    meta: [
      { title: "Отчёт руководителя — Радиус Трек" },
      { name: "description", content: "Сводный отчёт по маршрутам и доставкам" },
    ],
  }),
  component: DirectorPage,
});

type RouteRow = {
  id: string;
  route_number: string;
  route_date: string;
  status: DeliveryRouteStatus;
  assigned_driver: string | null;
  assigned_vehicle: string | null;
  delivery_cost?: number | null;
  cost_method?: string | null;
  cost_per_km?: number | null;
  cost_per_point?: number | null;
  total_distance_km?: number | null;
  points_count?: number | null;
  manual_cost?: boolean | null;
};

const COST_METHOD_LABELS: Record<string, string> = {
  manual: "Вручную",
  per_km: "За километр",
  per_point: "За точку",
  km_plus_point: "Км + точка",
};

type PointRow = {
  route_id: string;
  dp_status: string;
  dp_undelivered_reason: string | null;
  dp_amount_received: number | null;
  order: { amount_due: number | null; payment_type: string | null } | null;
};

type Totals = {
  delivered: number;
  not_delivered: number;
  returned: number;
  total: number;
  amountDue: number;
  amountReceived: number;
  diff: number;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n);

function emptyTotals(): Totals {
  return {
    delivered: 0,
    not_delivered: 0,
    returned: 0,
    total: 0,
    amountDue: 0,
    amountReceived: 0,
    diff: 0,
  };
}

function aggregate(point: PointRow, into: Totals) {
  into.total += 1;
  if (point.dp_status === "delivered") into.delivered += 1;
  else if (point.dp_status === "not_delivered") into.not_delivered += 1;
  else if (point.dp_status === "returned_to_warehouse") into.returned += 1;

  const due = Number(point.order?.amount_due ?? 0) || 0;
  const recv = Number(point.dp_amount_received ?? 0) || 0;
  if (point.dp_status === "delivered") {
    into.amountDue += due;
    into.amountReceived += recv;
  }
}

function DirectorPage() {
  const today = new Date();
  const monthAgo = new Date();
  monthAgo.setDate(today.getDate() - 30);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = useState<string>(iso(monthAgo));
  const [dateTo, setDateTo] = useState<string>(iso(today));
  const [driverFilter, setDriverFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: routes = [] } = useQuery({
    queryKey: ["director-routes", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_routes")
        .select("id, route_number, route_date, status, assigned_driver, assigned_vehicle, source_request_id")
        .gte("route_date", dateFrom)
        .lte("route_date", dateTo)
        .order("route_date", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as Array<RouteRow & { source_request_id: string | null }>;

      const reqIds = Array.from(
        new Set(rows.map((r) => r.source_request_id).filter(Boolean) as string[])
      );
      const costMap = new Map<string, {
        delivery_cost: number;
        cost_method: string;
        cost_per_km: number;
        cost_per_point: number;
        total_distance_km: number;
        points_count: number;
        manual_cost: boolean;
      }>();
      if (reqIds.length > 0) {
        const { data: rs } = await supabase
          .from("routes")
          .select("id, delivery_cost, cost_method, cost_per_km, cost_per_point, total_distance_km, points_count, manual_cost")
          .in("id", reqIds);
        (rs ?? []).forEach((x) => costMap.set(x.id as string, x as never));
      }

      return rows.map((r) => {
        const c = r.source_request_id ? costMap.get(r.source_request_id) : undefined;
        return {
          ...r,
          delivery_cost: c?.delivery_cost ?? 0,
          cost_method: c?.cost_method ?? "manual",
          cost_per_km: c?.cost_per_km ?? 0,
          cost_per_point: c?.cost_per_point ?? 0,
          total_distance_km: c?.total_distance_km ?? 0,
          points_count: c?.points_count ?? 0,
          manual_cost: c?.manual_cost ?? false,
        } as RouteRow;
      });
    },
  });

  const routeIds = useMemo(() => routes.map((r) => r.id), [routes]);

  const { data: points = [] } = useQuery({
    queryKey: ["director-points", routeIds],
    enabled: routeIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("route_points")
        .select(
          "route_id, dp_status, dp_undelivered_reason, dp_amount_received, order:orders(amount_due, payment_type)"
        )
        .in("route_id", routeIds);
      if (error) throw error;
      return (data ?? []) as unknown as PointRow[];
    },
  });

  const drivers = useMemo(() => {
    const set = new Set<string>();
    routes.forEach((r) => r.assigned_driver && set.add(r.assigned_driver));
    return Array.from(set).sort();
  }, [routes]);

  const filteredRoutes = useMemo(() => {
    return routes.filter((r) => {
      if (driverFilter !== "all" && r.assigned_driver !== driverFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      return true;
    });
  }, [routes, driverFilter, statusFilter]);

  const filteredRouteIds = useMemo(
    () => new Set(filteredRoutes.map((r) => r.id)),
    [filteredRoutes]
  );

  const filteredPoints = useMemo(
    () => points.filter((p) => filteredRouteIds.has(p.route_id)),
    [points, filteredRouteIds]
  );

  const totalsByRoute = useMemo(() => {
    const map = new Map<string, Totals>();
    filteredPoints.forEach((p) => {
      let t = map.get(p.route_id);
      if (!t) {
        t = emptyTotals();
        map.set(p.route_id, t);
      }
      aggregate(p, t);
    });
    map.forEach((t) => {
      t.diff = t.amountReceived - t.amountDue;
    });
    return map;
  }, [filteredPoints]);

  const overall = useMemo(() => {
    const t = emptyTotals();
    filteredPoints.forEach((p) => aggregate(p, t));
    t.diff = t.amountReceived - t.amountDue;
    return t;
  }, [filteredPoints]);

  const completedRoutes = filteredRoutes.filter((r) => r.status === "completed").length;

  const problems = useMemo(() => {
    const counts = {
      no_qr: 0,
      no_payment: 0,
      client_no_answer: 0,
      client_refused: 0,
      returned: 0,
      defective: 0,
    };
    filteredPoints.forEach((p) => {
      if (p.dp_status === "returned_to_warehouse") counts.returned += 1;
      const r = p.dp_undelivered_reason;
      if (r === "no_qr") counts.no_qr += 1;
      else if (r === "no_payment") counts.no_payment += 1;
      else if (r === "client_no_answer") counts.client_no_answer += 1;
      else if (r === "client_refused") counts.client_refused += 1;
      else if (r === "defective") counts.defective += 1;
    });
    return counts;
  }, [filteredPoints]);

  const costSummary = useMemo(() => {
    let totalCost = 0;
    let totalKm = 0;
    let totalPoints = 0;
    filteredRoutes.forEach((r) => {
      totalCost += Number(r.delivery_cost) || 0;
      totalKm += Number(r.total_distance_km) || 0;
      totalPoints += Number(r.points_count) || 0;
    });
    const n = filteredRoutes.length;
    return {
      totalCost,
      totalKm,
      totalPoints,
      avgPerRoute: n > 0 ? totalCost / n : 0,
      avgPerPoint: totalPoints > 0 ? totalCost / totalPoints : 0,
      avgPerKm: totalKm > 0 ? totalCost / totalKm : 0,
    };
  }, [filteredRoutes]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold">Отчёт руководителя</h1>
        </div>

        {/* Фильтры */}
        <div className="mb-6 grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="text-xs">Дата с</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Дата по</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Водитель</Label>
            <Select value={driverFilter} onValueChange={setDriverFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все водители</SelectItem>
                {drivers.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Статус маршрута</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                {(Object.keys(DELIVERY_ROUTE_STATUS_LABELS) as DeliveryRouteStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {DELIVERY_ROUTE_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* KPI */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
          <KpiCard icon={<Truck className="h-4 w-4" />} label="Всего маршрутов" value={String(filteredRoutes.length)} />
          <KpiCard icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} label="Завершено маршрутов" value={String(completedRoutes)} />
          <KpiCard icon={<BarChart3 className="h-4 w-4" />} label="Всего точек" value={String(overall.total)} />
          <KpiCard icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} label="Доставлено" value={String(overall.delivered)} />
          <KpiCard icon={<XCircle className="h-4 w-4 text-rose-600" />} label="Не доставлено" value={String(overall.not_delivered)} />
          <KpiCard icon={<Undo2 className="h-4 w-4 text-amber-600" />} label="Возврат на склад" value={String(overall.returned)} />
          <KpiCard icon={<Wallet className="h-4 w-4" />} label="Сумма к получению" value={fmt(overall.amountDue)} />
          <KpiCard icon={<Wallet className="h-4 w-4 text-emerald-600" />} label="Фактически получено" value={fmt(overall.amountReceived)} />
          <KpiCard
            icon={<AlertTriangle className={`h-4 w-4 ${overall.diff === 0 ? "text-muted-foreground" : "text-rose-600"}`} />}
            label="Расхождение по оплате"
            value={(overall.diff > 0 ? "+" : "") + fmt(overall.diff)}
            tone={overall.diff === 0 ? "neutral" : "warn"}
          />
        </div>

        {/* Проблемы */}
        <section className="mb-6 rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h2 className="text-lg font-semibold">Проблемы</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ProblemCard icon={<QrCode className="h-4 w-4" />} label="Нет QR-кода" value={problems.no_qr} />
            <ProblemCard icon={<CreditCard className="h-4 w-4" />} label="Нет оплаты" value={problems.no_payment} />
            <ProblemCard icon={<PhoneOff className="h-4 w-4" />} label="Клиент не отвечает" value={problems.client_no_answer} />
            <ProblemCard icon={<Ban className="h-4 w-4" />} label="Клиент отказался" value={problems.client_refused} />
            <ProblemCard icon={<Undo2 className="h-4 w-4" />} label="Возврат на склад" value={problems.returned} />
            <ProblemCard icon={<PackageX className="h-4 w-4" />} label="Повреждение / брак" value={problems.defective} />
          </div>
        </section>

        {/* Стоимость доставки */}
        <section className="mb-6 rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border p-4">
            <Wallet className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Стоимость доставки</h2>
          </div>

          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard icon={<Wallet className="h-4 w-4 text-primary" />} label="Общая стоимость" value={fmt(costSummary.totalCost) + " ₽"} />
            <KpiCard icon={<Truck className="h-4 w-4" />} label="Средняя на маршрут" value={fmt(costSummary.avgPerRoute) + " ₽"} />
            <KpiCard icon={<BarChart3 className="h-4 w-4" />} label="Средняя на точку" value={fmt(costSummary.avgPerPoint) + " ₽"} />
            <KpiCard icon={<BarChart3 className="h-4 w-4" />} label="Средняя на 1 км" value={fmt(costSummary.avgPerKm) + " ₽"} />
          </div>

          {filteredRoutes.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Нет данных за выбранный период
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">№ маршрута</th>
                    <th className="px-3 py-2 text-left">Водитель</th>
                    <th className="px-3 py-2 text-left">Машина</th>
                    <th className="px-3 py-2 text-left">Дата</th>
                    <th className="px-3 py-2 text-right">Точек</th>
                    <th className="px-3 py-2 text-right">Км</th>
                    <th className="px-3 py-2 text-left">Способ</th>
                    <th className="px-3 py-2 text-right">За км, ₽</th>
                    <th className="px-3 py-2 text-right">За точку, ₽</th>
                    <th className="px-3 py-2 text-right">Итого, ₽</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRoutes.map((r) => {
                    const km = Number(r.total_distance_km) || 0;
                    const pts = Number(r.points_count) || 0;
                    const total = Number(r.delivery_cost) || 0;
                    const method = r.cost_method ?? "manual";
                    return (
                      <tr key={`cost-${r.id}`} className="border-t border-border hover:bg-muted/30">
                        <td className="px-3 py-2">
                          <Link
                            to="/delivery-routes/$deliveryRouteId"
                            params={{ deliveryRouteId: r.id }}
                            className="font-medium text-primary hover:underline"
                          >
                            {r.route_number}
                          </Link>
                        </td>
                        <td className="px-3 py-2">{r.assigned_driver ?? "—"}</td>
                        <td className="px-3 py-2">{r.assigned_vehicle ?? "—"}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {new Date(r.route_date).toLocaleDateString("ru-RU")}
                        </td>
                        <td className="px-3 py-2 text-right">{pts}</td>
                        <td className="px-3 py-2 text-right">{fmt(km)}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline">{COST_METHOD_LABELS[method] ?? method}</Badge>
                          {r.manual_cost && (
                            <div className="mt-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                              Стоимость изменена вручную
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">{fmt(Number(r.cost_per_km) || 0)}</td>
                        <td className="px-3 py-2 text-right">{fmt(Number(r.cost_per_point) || 0)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-primary">{fmt(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-muted/30 text-xs">
                  <tr className="border-t border-border">
                    <td colSpan={4} className="px-3 py-2 text-right font-semibold">Итого:</td>
                    <td className="px-3 py-2 text-right font-semibold">{costSummary.totalPoints}</td>
                    <td className="px-3 py-2 text-right font-semibold">{fmt(costSummary.totalKm)}</td>
                    <td colSpan={3}></td>
                    <td className="px-3 py-2 text-right font-bold text-primary">{fmt(costSummary.totalCost)} ₽</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>

        {/* Таблица маршрутов */}
        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-4">
            <h2 className="text-lg font-semibold">Маршруты</h2>
          </div>
          {filteredRoutes.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Нет маршрутов за выбранный период
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">№ маршрута</th>
                    <th className="px-3 py-2 text-left">Водитель</th>
                    <th className="px-3 py-2 text-left">Машина</th>
                    <th className="px-3 py-2 text-left">Дата</th>
                    <th className="px-3 py-2 text-left">Статус</th>
                    <th className="px-3 py-2 text-right">Доставлено</th>
                    <th className="px-3 py-2 text-right">Не доставлено</th>
                    <th className="px-3 py-2 text-right">Возврат</th>
                    <th className="px-3 py-2 text-right">К получению</th>
                    <th className="px-3 py-2 text-right">Получено</th>
                    <th className="px-3 py-2 text-right">Расхождение</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRoutes.map((r) => {
                    const t = totalsByRoute.get(r.id) ?? emptyTotals();
                    return (
                      <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                        <td className="px-3 py-2">
                          <Link
                            to="/delivery-routes/$deliveryRouteId"
                            params={{ deliveryRouteId: r.id }}
                            className="font-medium text-primary hover:underline"
                          >
                            {r.route_number}
                          </Link>
                        </td>
                        <td className="px-3 py-2">{r.assigned_driver ?? "—"}</td>
                        <td className="px-3 py-2">{r.assigned_vehicle ?? "—"}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {new Date(r.route_date).toLocaleDateString("ru-RU")}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={DELIVERY_ROUTE_STATUS_STYLES[r.status]}>
                            {DELIVERY_ROUTE_STATUS_LABELS[r.status]}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right">{t.delivered}</td>
                        <td className="px-3 py-2 text-right">{t.not_delivered}</td>
                        <td className="px-3 py-2 text-right">{t.returned}</td>
                        <td className="px-3 py-2 text-right">{fmt(t.amountDue)}</td>
                        <td className="px-3 py-2 text-right">{fmt(t.amountReceived)}</td>
                        <td
                          className={`px-3 py-2 text-right font-medium ${
                            t.diff === 0
                              ? "text-muted-foreground"
                              : t.diff < 0
                              ? "text-rose-600"
                              : "text-emerald-600"
                          }`}
                        >
                          {(t.diff > 0 ? "+" : "") + fmt(t.diff)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "neutral" | "warn";
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        tone === "warn" ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20" : "border-border bg-card"
      }`}
    >
      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

function ProblemCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2.5">
      <div className="flex items-center gap-2 text-sm">
        {icon}
        <span>{label}</span>
      </div>
      <span className={`text-lg font-semibold ${value > 0 ? "text-foreground" : "text-muted-foreground"}`}>
        {value}
      </span>
    </div>
  );
}
