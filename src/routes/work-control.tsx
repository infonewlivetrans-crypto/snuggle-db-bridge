import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/work-control")({
  head: () => ({
    meta: [
      { title: "Контроль работы — Радиус Трек" },
      {
        name: "description",
        content:
          "Контроль отклонений и проблем в работе за текущий день: рейсы, водители, точки, отчёты, возвраты.",
      },
    ],
  }),
  component: WorkControlPage,
});

type Priority = "critical" | "important" | "later";

const PRIORITY_LABEL: Record<Priority, string> = {
  critical: "Критично",
  important: "Важно",
  later: "Можно позже",
};

const PRIORITY_STYLES: Record<Priority, string> = {
  critical:
    "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  important:
    "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  later:
    "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30",
};

const PRIORITY_RANK: Record<Priority, number> = {
  critical: 0,
  important: 1,
  later: 2,
};

type ProblemItem = { id: string; label: string; sub?: string; href?: string };

type Problem = {
  key: string;
  title: string;
  description: string;
  priority: Priority;
  count: number;
  items: ProblemItem[];
  actionLabel: string;
  actionHref: string;
};

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    dateStr: start.toISOString().slice(0, 10),
  };
}

function WorkControlPage() {
  const { startIso, endIso, dateStr } = useMemo(todayRange, []);

  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["work-control", dateStr],
    refetchInterval: 60_000, // обновление раз в минуту
    refetchIntervalInBackground: false,
    staleTime: 30_000,
    queryFn: async (): Promise<Problem[]> => {
      // 1) Заказы за сегодня — без рейса (route_points отсутствует)
      const ordersTodayQ = supabase
        .from("orders")
        .select("id, order_number, status, created_at")
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .order("created_at", { ascending: false })
        .limit(200);

      // 2) Рейсы за сегодня
      const routesTodayQ = supabase
        .from("routes")
        .select(
          "id, route_number, route_date, status, driver_id, driver_name, planned_departure_at",
        )
        .eq("route_date", dateStr)
        .order("created_at", { ascending: false });

      // 3) Точки за сегодня
      const pointsTodayQ = supabase
        .from("route_points")
        .select(
          "id, route_id, status, dp_status, eta_risk, eta_window_to, completed_at, planned_time, point_number",
        )
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .limit(1000);

      // 4) Отчёты за сегодня
      const reportsTodayQ = supabase
        .from("delivery_reports")
        .select("id, route_id, created_at")
        .gte("created_at", startIso)
        .lt("created_at", endIso);

      // 5) Активность системы (audit_log) за последний час
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const activityQ = supabase
        .from("audit_log")
        .select("id, created_at", { count: "exact", head: true })
        .gte("created_at", oneHourAgo);

      const [ordersRes, routesRes, pointsRes, reportsRes, activityRes] =
        await Promise.all([
          ordersTodayQ,
          routesTodayQ,
          pointsTodayQ,
          reportsTodayQ,
          activityQ,
        ]);

      const orders = ordersRes.data ?? [];
      const routes = routesRes.data ?? [];
      const points = pointsRes.data ?? [];
      const reports = reportsRes.data ?? [];
      const activityCount = activityRes.count ?? 0;

      // Какие order_id уже есть в рейсах (по сегодняшним точкам).
      // Дополнительно подгружаем точки старше суток, чтобы не считать
      // повторяющиеся заказы как "без рейса".
      const orderIdsToday = orders.map((o) => o.id);
      let assignedOrderIds = new Set<string>();
      if (orderIdsToday.length > 0) {
        const { data: assigned } = await supabase
          .from("route_points")
          .select("order_id")
          .in("order_id", orderIdsToday);
        assignedOrderIds = new Set(
          (assigned ?? []).map((r) => String(r.order_id)),
        );
      }

      // Какие маршруты имеют отчёт
      const routesWithReport = new Set(
        reports.map((r) => String(r.route_id)).filter(Boolean),
      );

      const now = new Date();

      // ====== Сборка проблем ======
      const problems: Problem[] = [];

      // (а) Не создано ни одного рейса
      if (routes.length === 0) {
        problems.push({
          key: "no-routes",
          title: "Не создано ни одного рейса",
          description: "За сегодняшний день рейсов ещё нет.",
          priority: "critical",
          count: 1,
          items: [{ id: "x", label: "Сегодня нет рейсов" }],
          actionLabel: "Создать рейс",
          actionHref: "/delivery-routes",
        });
      }

      // (б) Заказы без рейсов (новые заказы сегодня, не попавшие в точки)
      const ordersWithoutRoute = orders.filter(
        (o) =>
          !assignedOrderIds.has(o.id) &&
          !["cancelled", "completed", "delivered", "return_accepted"].includes(
            String(o.status),
          ),
      );
      if (ordersWithoutRoute.length > 0) {
        problems.push({
          key: "orders-no-route",
          title: "Заказы без рейса",
          description: "Заказы созданы сегодня, но не назначены ни в один рейс.",
          priority: "important",
          count: ordersWithoutRoute.length,
          items: ordersWithoutRoute.slice(0, 20).map((o) => ({
            id: o.id,
            label: o.order_number ?? o.id.slice(0, 8),
            sub: `Статус: ${o.status}`,
          })),
          actionLabel: "Перейти в подбор",
          actionHref: "/transport-requests/picker",
        });
      }

      // (в) Рейсы без водителя
      const routesNoDriver = routes.filter(
        (r) => !r.driver_id && !r.driver_name,
      );
      if (routesNoDriver.length > 0) {
        problems.push({
          key: "routes-no-driver",
          title: "Рейсы без водителя",
          description: "На сегодня созданы рейсы без назначенного водителя.",
          priority: "critical",
          count: routesNoDriver.length,
          items: routesNoDriver.slice(0, 20).map((r) => ({
            id: r.id,
            label: r.route_number ?? r.id.slice(0, 8),
            sub: `Статус: ${r.status}`,
            href: `/routes/${r.id}`,
          })),
          actionLabel: "Открыть рейсы",
          actionHref: "/delivery-routes",
        });
      }

      // (г) Водитель не начал маршрут — рейс не in_progress, но запланированное
      // время отправления уже прошло, либо рейс остался в planned после полудня.
      const noon = new Date();
      noon.setHours(12, 0, 0, 0);
      const routesNotStarted = routes.filter((r) => {
        if (String(r.status) !== "planned") return false;
        if (!(r.driver_id || r.driver_name)) return false; // отдельная категория
        if (r.planned_departure_at) {
          return new Date(r.planned_departure_at).getTime() < now.getTime();
        }
        return now.getTime() > noon.getTime();
      });
      if (routesNotStarted.length > 0) {
        problems.push({
          key: "routes-not-started",
          title: "Водитель не начал маршрут",
          description:
            "Рейс с водителем, но всё ещё в статусе «Запланирован».",
          priority: "important",
          count: routesNotStarted.length,
          items: routesNotStarted.slice(0, 20).map((r) => ({
            id: r.id,
            label: r.route_number ?? r.id.slice(0, 8),
            sub: r.driver_name ?? "Водитель назначен",
            href: `/routes/${r.id}`,
          })),
          actionLabel: "Открыть рейсы",
          actionHref: "/delivery-routes",
        });
      }

      // (д) Незакрытые точки в завершённых рейсах
      const completedRouteIds = new Set(
        routes
          .filter((r) => String(r.status) === "completed")
          .map((r) => String(r.id)),
      );
      const openPointsInCompleted = points.filter(
        (p) =>
          completedRouteIds.has(String(p.route_id)) &&
          !["completed", "failed", "returned_to_warehouse", "defective"].includes(
            String(p.status),
          ),
      );
      if (openPointsInCompleted.length > 0) {
        problems.push({
          key: "open-points",
          title: "Есть незакрытые точки",
          description:
            "В завершённых рейсах остались точки без финального статуса.",
          priority: "important",
          count: openPointsInCompleted.length,
          items: openPointsInCompleted.slice(0, 20).map((p) => ({
            id: p.id,
            label: `Точка №${p.point_number}`,
            sub: `Статус: ${p.status}`,
            href: `/routes/${p.route_id}`,
          })),
          actionLabel: "Перейти к рейсам",
          actionHref: "/delivery-routes",
        });
      }

      // (е) Просроченные доставки — точки, у которых eta_window_to прошёл,
      // а статус не финальный.
      const overduePoints = points.filter((p) => {
        if (
          ["completed", "failed", "returned_to_warehouse", "defective"].includes(
            String(p.status),
          )
        ) {
          return false;
        }
        if (p.eta_window_to) {
          return new Date(p.eta_window_to).getTime() < now.getTime();
        }
        return false;
      });
      if (overduePoints.length > 0) {
        problems.push({
          key: "overdue",
          title: "Есть просроченные доставки",
          description: "Точки, у которых вышло окно доставки.",
          priority: "critical",
          count: overduePoints.length,
          items: overduePoints.slice(0, 20).map((p) => ({
            id: p.id,
            label: `Точка №${p.point_number}`,
            sub: `Окно до: ${
              p.eta_window_to
                ? new Date(p.eta_window_to).toLocaleTimeString("ru-RU", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"
            }`,
            href: `/routes/${p.route_id}`,
          })),
          actionLabel: "Открыть рейсы",
          actionHref: "/delivery-routes",
        });
      }

      // (ж) Нет отчёта по рейсу — завершённые рейсы без записи в delivery_reports
      const completedRoutes = routes.filter(
        (r) => String(r.status) === "completed",
      );
      const routesNoReport = completedRoutes.filter(
        (r) => !routesWithReport.has(String(r.id)),
      );
      if (routesNoReport.length > 0) {
        problems.push({
          key: "no-report",
          title: "Нет отчёта по рейсу",
          description: "Рейс завершён, но отчёт ещё не сформирован.",
          priority: "important",
          count: routesNoReport.length,
          items: routesNoReport.slice(0, 20).map((r) => ({
            id: r.id,
            label: r.route_number ?? r.id.slice(0, 8),
            sub: r.driver_name ?? "",
            href: `/routes/${r.id}`,
          })),
          actionLabel: "Перейти к отчётам",
          actionHref: "/route-reports",
        });
      }

      // (з) Возвраты без обработки — заказы со статусом awaiting_return
      const returnsToProcess = orders.filter(
        (o) => String(o.status) === "awaiting_return",
      );
      if (returnsToProcess.length > 0) {
        problems.push({
          key: "returns",
          title: "Возвраты без обработки",
          description: "Заказы ожидают приёма возврата на склад.",
          priority: "later",
          count: returnsToProcess.length,
          items: returnsToProcess.slice(0, 20).map((o) => ({
            id: o.id,
            label: o.order_number ?? o.id.slice(0, 8),
          })),
          actionLabel: "Открыть возвраты",
          actionHref: "/warehouse-returns",
        });
      }

      // (и) Нет активности в системе — за последний час нет записей в audit_log
      if (activityCount === 0) {
        problems.push({
          key: "no-activity",
          title: "Нет активности в системе",
          description: "За последний час не зафиксировано действий пользователей.",
          priority: "later",
          count: 1,
          items: [{ id: "x", label: "Действий не было > 60 мин" }],
          actionLabel: "Журнал действий",
          actionHref: "/audit-log",
        });
      }

      // Сортировка по приоритету
      problems.sort(
        (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
      );
      return problems;
    },
  });

  const problems = data ?? [];
  const counts = {
    critical: problems.filter((p) => p.priority === "critical").length,
    important: problems.filter((p) => p.priority === "important").length,
    later: problems.filter((p) => p.priority === "later").length,
  };

  const updatedLabel = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";

  const today = new Date().toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1200px] px-3 py-6 sm:px-4 lg:px-6">
        {/* Шапка */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
              Контроль работы
            </h1>
            <p className="mt-1 text-sm text-muted-foreground capitalize">
              {today}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Обновлено: {updatedLabel} · авто каждые 60 сек
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw
                className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
              />
              Обновить
            </Button>
          </div>
        </div>

        {/* Сводка по приоритетам */}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <SummaryCard
            label="Критично"
            count={counts.critical}
            priority="critical"
            icon={AlertCircle}
          />
          <SummaryCard
            label="Важно"
            count={counts.important}
            priority="important"
            icon={AlertTriangle}
          />
          <SummaryCard
            label="Можно позже"
            count={counts.later}
            priority="later"
            icon={Info}
          />
        </div>

        {/* Список проблем */}
        <div className="mt-6 space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Загрузка данных…</p>
          ) : problems.length === 0 ? (
            <Card className="border-emerald-500/40">
              <CardContent className="flex items-center gap-3 p-6">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    Проблем не обнаружено
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Сегодняшняя работа идёт без отклонений.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            problems.map((p) => <ProblemCard key={p.key} problem={p} />)
          )}
        </div>
      </main>
    </div>
  );
}

function SummaryCard({
  label,
  count,
  priority,
  icon: Icon,
}: {
  label: string;
  count: number;
  priority: Priority;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className={count > 0 ? PRIORITY_STYLES[priority] : ""}>
      <CardContent className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5" />
          <div>
            <div className="text-xs uppercase tracking-wide opacity-80">
              {label}
            </div>
            <div className="text-2xl font-bold leading-tight">{count}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProblemCard({ problem }: { problem: Problem }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{problem.title}</CardTitle>
              <Badge
                variant="outline"
                className={PRIORITY_STYLES[problem.priority]}
              >
                {PRIORITY_LABEL[problem.priority]}
              </Badge>
              <Badge variant="secondary" className="font-mono">
                {problem.count}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {problem.description}
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to={problem.actionHref}>
              {problem.actionLabel}
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      {problem.items.length > 0 ? (
        <CardContent className="pt-0">
          <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {problem.items.map((it) => (
              <li
                key={it.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">
                    {it.label}
                  </div>
                  {it.sub ? (
                    <div className="truncate text-muted-foreground">
                      {it.sub}
                    </div>
                  ) : null}
                </div>
                {it.href ? (
                  <Link
                    to={it.href}
                    className="shrink-0 text-primary hover:underline"
                  >
                    Открыть
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
          {problem.count > problem.items.length ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Показаны первые {problem.items.length} из {problem.count}.
            </p>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}
