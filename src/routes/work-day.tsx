import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sun,
  Sunrise,
  Sunset,
  Truck,
  CheckCircle2,
  Circle,
  AlertCircle,
  ArrowRight,
  FileSpreadsheet,
  ClipboardList,
  Route as RouteIcon,
  User,
  PlayCircle,
  FileText,
  PackageSearch,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useEnabledModules, useLaunchMode, isPathVisibleInLaunchMode } from "@/lib/modules";

export const Route = createFileRoute("/work-day")({
  head: () => ({
    meta: [
      { title: "Рабочий день — Радиус Трек" },
      {
        name: "description",
        content:
          "Сценарий одного рабочего дня: импорт заказов, формирование рейсов, выполнение и отчёты.",
      },
    ],
  }),
  component: WorkDayPage,
});

type DayStatus = "not_started" | "in_progress" | "completed";

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function WorkDayPage() {
  const enabled = useEnabledModules();
  const launchMode = useLaunchMode();
  const { start, end } = useMemo(todayRange, []);

  // Считаем сегодняшние данные напрямую — отдельной бизнес-логики не вводим
  const { data, isLoading } = useQuery({
    queryKey: ["work-day", start],
    queryFn: async () => {
      // Заказы за сегодня (по created_at)
      const ordersQ = supabase
        .from("orders")
        .select("id, status", { count: "exact", head: false })
        .gte("created_at", start)
        .lt("created_at", end);

      // Рейсы за сегодня (по route_date)
      const routesQ = supabase
        .from("routes")
        .select("id, status, driver_id, driver_name")
        .gte("route_date", start.slice(0, 10))
        .lt("route_date", end.slice(0, 10));

      const [ordersRes, routesRes] = await Promise.all([ordersQ, routesQ]);

      const orders = ordersRes.data ?? [];
      const routes = routesRes.data ?? [];

      const ordersLoaded = orders.length;
      const routesCreated = routes.length;
      const routesWithDriver = routes.filter(
        (r) => Boolean(r.driver_id) || Boolean(r.driver_name),
      ).length;
      const routesIssued = routes.filter((r) =>
        ["issued", "in_progress", "completed", "closed"].includes(String(r.status)),
      ).length;
      const routesCompleted = routes.filter((r) =>
        ["completed", "closed"].includes(String(r.status)),
      ).length;
      const reportsReady = routesCompleted; // отчёт = завершённый рейс

      return {
        ordersLoaded,
        routesCreated,
        routesWithDriver,
        routesIssued,
        routesCompleted,
        reportsReady,
      };
    },
    staleTime: 30_000,
  });

  const checklist = useMemo(
    () => [
      { key: "orders", label: "Заказы загружены", done: (data?.ordersLoaded ?? 0) > 0, value: data?.ordersLoaded },
      { key: "routes", label: "Рейсы созданы", done: (data?.routesCreated ?? 0) > 0, value: data?.routesCreated },
      { key: "drivers", label: "Водители назначены", done: (data?.routesCreated ?? 0) > 0 && data?.routesWithDriver === data?.routesCreated, value: `${data?.routesWithDriver ?? 0}/${data?.routesCreated ?? 0}` },
      { key: "issued", label: "Рейсы выданы", done: (data?.routesCreated ?? 0) > 0 && data?.routesIssued === data?.routesCreated, value: `${data?.routesIssued ?? 0}/${data?.routesCreated ?? 0}` },
      { key: "points", label: "Точки выполнены", done: (data?.routesCreated ?? 0) > 0 && data?.routesCompleted === data?.routesCreated, value: `${data?.routesCompleted ?? 0}/${data?.routesCreated ?? 0}` },
      { key: "reports", label: "Отчёты сформированы", done: (data?.reportsReady ?? 0) > 0 && data?.reportsReady === data?.routesCreated, value: `${data?.reportsReady ?? 0}/${data?.routesCreated ?? 0}` },
    ],
    [data],
  );

  const doneCount = checklist.filter((c) => c.done).length;
  const dayStatus: DayStatus =
    doneCount === 0
      ? "not_started"
      : doneCount === checklist.length
        ? "completed"
        : "in_progress";

  const dayStatusLabel: Record<DayStatus, string> = {
    not_started: "День не начат",
    in_progress: "В процессе",
    completed: "Завершён",
  };
  const dayStatusVariant: Record<DayStatus, "secondary" | "default"> = {
    not_started: "secondary",
    in_progress: "default",
    completed: "default",
  };
  const dayStatusColor: Record<DayStatus, string> = {
    not_started: "bg-muted text-muted-foreground",
    in_progress: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
    completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  };

  const today = new Date().toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  type StepAction = { to: string; label: string; hidden?: boolean };
  type Step = {
    title: string;
    desc: string;
    icon: React.ComponentType<{ className?: string }>;
    actions: StepAction[];
    done: boolean;
  };

  const morning: Step[] = [
    {
      title: "Импорт заказов",
      desc: "Загрузите заказы из Excel или 1С на сегодняшний день.",
      icon: FileSpreadsheet,
      done: (data?.ordersLoaded ?? 0) > 0,
      actions: [
        { to: "/data-import", label: "Импорт Excel", hidden: !enabled.excel_import },
        { to: "/transport-requests", label: "Заявки на транспорт" },
      ],
    },
    {
      title: "Проверка заказов",
      desc: "Просмотрите загруженные заказы и подберите их в рейсы.",
      icon: ClipboardList,
      done: (data?.ordersLoaded ?? 0) > 0,
      actions: [
        { to: "/", label: "Заказы" },
        { to: "/transport-requests/picker", label: "Подбор заказов" },
      ],
    },
  ];

  const day: Step[] = [
    {
      title: "Формирование рейсов",
      desc: "Сгруппируйте заказы в маршруты и создайте рейсы.",
      icon: RouteIcon,
      done: (data?.routesCreated ?? 0) > 0,
      actions: [
        { to: "/delivery-routes", label: "Маршруты" },
        { to: "/routes", label: "Маршруты (план)" },
      ],
    },
    {
      title: "Назначение водителей",
      desc: "Выберите водителя и машину для каждого рейса.",
      icon: User,
      done:
        (data?.routesCreated ?? 0) > 0 &&
        data?.routesWithDriver === data?.routesCreated,
      actions: [
        { to: "/drivers", label: "Водители" },
        { to: "/delivery-routes", label: "Открыть рейсы" },
      ],
    },
    {
      title: "Выдача маршрутов",
      desc: "Передайте маршруты водителям — внутренним или перевозчикам.",
      icon: Truck,
      done:
        (data?.routesCreated ?? 0) > 0 &&
        data?.routesIssued === data?.routesCreated,
      actions: [
        { to: "/logist", label: "Кабинет логиста" },
        { to: "/carrier-offers", label: "Предложения перевозчикам", hidden: !enabled.carriers },
      ],
    },
  ];

  const inDay: Step[] = [
    {
      title: "Выполнение точек",
      desc: "Водители прибывают на точки, фиксируют статусы, фото, QR и оплату.",
      icon: PlayCircle,
      done:
        (data?.routesCreated ?? 0) > 0 &&
        (data?.routesIssued ?? 0) > 0,
      actions: [
        { to: "/delivery-routes", label: "Активные рейсы" },
        { to: "/driver", label: "Кабинет водителя" },
      ],
    },
  ];

  const evening: Step[] = [
    {
      title: "Завершение рейсов",
      desc: "Закройте рейсы, проверьте документы перевозчиков.",
      icon: CheckCircle2,
      done:
        (data?.routesCreated ?? 0) > 0 &&
        data?.routesCompleted === data?.routesCreated,
      actions: [
        { to: "/delivery-routes", label: "Маршруты" },
      ],
    },
    {
      title: "Формирование отчётов",
      desc: "Проверьте итоговые отчёты по рейсам за день.",
      icon: FileText,
      done: (data?.reportsReady ?? 0) > 0,
      actions: [
        { to: "/route-reports", label: "Отчёты" },
        { to: "/director", label: "Отчёт руководителя" },
      ],
    },
    {
      title: "Проверка возвратов",
      desc: "Просмотрите возвраты с маршрутов и приём на склад.",
      icon: PackageSearch,
      done: false,
      actions: [
        { to: "/warehouse-returns", label: "Возвраты", hidden: !enabled.warehouse },
      ],
    },
    {
      title: "Проверка ошибок",
      desc: "Просмотрите системные ошибки и обратную связь за день.",
      icon: AlertCircle,
      done: false,
      actions: [
        { to: "/system-errors", label: "Ошибки системы" },
        { to: "/feedback", label: "Обратная связь" },
      ],
    },
  ];

  const sections: Array<{ title: string; icon: React.ComponentType<{ className?: string }>; steps: Step[] }> = [
    { title: "Утро", icon: Sunrise, steps: morning },
    { title: "День", icon: Sun, steps: day },
    { title: "В течение дня", icon: PlayCircle, steps: inDay },
    { title: "Вечер", icon: Sunset, steps: evening },
  ];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1200px] px-3 py-6 sm:px-4 lg:px-6">
        {/* Шапка */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Рабочий день</h1>
            <p className="mt-1 text-sm text-muted-foreground capitalize">{today}</p>
          </div>
          <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium ${dayStatusColor[dayStatus]}`}>
            <span className="h-2 w-2 rounded-full bg-current" />
            {dayStatusLabel[dayStatus]}
            <span className="text-xs opacity-80">· {doneCount}/{checklist.length}</span>
          </div>
        </div>

        {/* Чек-лист */}
        <Card className="mt-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Чек-лист дня</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {checklist.map((c) => (
                <div
                  key={c.key}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {c.done ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className={`truncate text-sm ${c.done ? "text-foreground" : "text-muted-foreground"}`}>
                      {c.label}
                    </span>
                  </div>
                  {c.value !== undefined ? (
                    <Badge variant="secondary" className="shrink-0 font-mono text-xs">
                      {String(c.value)}
                    </Badge>
                  ) : null}
                </div>
              ))}
            </div>
            {isLoading ? (
              <p className="mt-3 text-xs text-muted-foreground">Загрузка данных за сегодня…</p>
            ) : null}
          </CardContent>
        </Card>

        {/* Сценарий по периодам дня */}
        <div className="mt-6 space-y-6">
          {sections.map((section) => {
            const SIcon = section.icon;
            return (
              <section key={section.title}>
                <div className="mb-3 flex items-center gap-2">
                  <SIcon className="h-5 w-5 text-foreground" />
                  <h2 className="text-lg font-semibold text-foreground">{section.title}</h2>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {section.steps.map((step) => {
                    const Icon = step.icon;
                    const visibleActions = step.actions.filter(
                      (a) => !a.hidden && isPathVisibleInLaunchMode(a.to, launchMode),
                    );
                    return (
                      <Card key={step.title} className={step.done ? "border-emerald-500/40" : ""}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div
                              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
                                step.done
                                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                  : "bg-secondary text-foreground"
                              }`}
                            >
                              {step.done ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <h3 className="truncate text-sm font-semibold text-foreground">{step.title}</h3>
                                {step.done ? (
                                  <Badge variant="secondary" className="shrink-0 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                                    Готово
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.desc}</p>
                              {visibleActions.length > 0 ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {visibleActions.map((a) => (
                                    <Button key={a.to} asChild size="sm" variant="outline">
                                      <Link to={a.to}>
                                        {a.label}
                                        <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                                      </Link>
                                    </Button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
