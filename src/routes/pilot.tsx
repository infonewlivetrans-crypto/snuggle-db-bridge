import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  PlayCircle,
  StopCircle,
  RotateCcw,
  PartyPopper,
  AlertTriangle,
  RouteIcon,
} from "lucide-react";
import {
  DELIVERY_ROUTE_STATUS_LABELS,
  DELIVERY_ROUTE_STATUS_STYLES,
  type DeliveryRouteStatus,
} from "@/lib/deliveryRoutes";

export const Route = createFileRoute("/pilot")({
  head: () => ({
    meta: [
      { title: "Пилотный запуск — Радиус Трек" },
      {
        name: "description",
        content: "Подготовка системы к пилотному запуску: готовность, чек-лист, тестовые маршруты и ошибки.",
      },
    ],
  }),
  component: PilotPage,
});

const PILOT_STATE_KEY = "pilot_run_state_v1";

type PilotState = "idle" | "running" | "finished";

function loadState(): PilotState {
  if (typeof window === "undefined") return "idle";
  const v = localStorage.getItem(PILOT_STATE_KEY);
  if (v === "running" || v === "finished") return v;
  return "idle";
}
function saveState(s: PilotState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PILOT_STATE_KEY, s);
}

type ReadinessKey =
  | "routes"
  | "driverLink"
  | "photos"
  | "qr"
  | "cash"
  | "managerReport"
  | "directorReport"
  | "warehouseReturns"
  | "notifications";

const READINESS_LABELS: Record<ReadinessKey, string> = {
  routes: "Маршруты создаются",
  driverLink: "Ссылка водителя выдаётся",
  photos: "Загрузка фото работает",
  qr: "QR фиксируется",
  cash: "Оплата (наличка) фиксируется",
  managerReport: "Отчёт менеджеру формируется",
  directorReport: "Итоги для руководителя есть",
  warehouseReturns: "Склад видит возвраты",
  notifications: "Уведомления работают",
};

const CHECKLIST: { id: number; title: string; to: string; cta: string }[] = [
  { id: 1, title: "Логист создаёт маршрут", to: "/logist", cta: "Кабинет логиста" },
  { id: 2, title: "Добавляет точки в маршрут", to: "/delivery-routes", cta: "Маршруты" },
  { id: 3, title: "Назначает водителя и машину", to: "/delivery-routes", cta: "Маршруты" },
  { id: 4, title: "Проверяет маршрут", to: "/delivery-routes", cta: "Маршруты" },
  { id: 5, title: "Выдаёт маршрут водителю", to: "/delivery-routes", cta: "Маршруты" },
  { id: 6, title: "Водитель открывает маршрут", to: "/driver", cta: "Кабинет водителя" },
  { id: 7, title: "Закрывает точки: фото, QR, оплата", to: "/driver", cta: "Кабинет водителя" },
  { id: 8, title: "Завершает маршрут", to: "/driver", cta: "Кабинет водителя" },
  { id: 9, title: "Менеджер получает отчёт", to: "/route-reports", cta: "Отчёты по маршрутам" },
  { id: 10, title: "Руководитель видит итог", to: "/director", cta: "Отчёт руководителя" },
  { id: 11, title: "Склад видит возвраты", to: "/warehouse-returns", cta: "Возвраты на складе" },
];

type TestRoute = {
  id: string;
  route_number: string;
  route_date: string;
  status: DeliveryRouteStatus;
  assigned_driver: string | null;
  points_count?: number;
  created_at: string;
};

type SystemIssue = {
  id: string;
  title: string;
  severity: string;
  status: string;
  role: string;
  location: string | null;
  created_at: string;
};

function PilotPage() {
  const [state, setState] = useState<PilotState>(() => loadState());

  const readiness = useQuery({
    queryKey: ["pilot-readiness"],
    queryFn: async (): Promise<Record<ReadinessKey, boolean>> => {
      const [routes, tokens, photos, qrPhotos, cashPay, reports, completedRoutes, returns, notifs] =
        await Promise.all([
          supabase.from("delivery_routes").select("id", { count: "exact", head: true }),
          supabase
            .from("delivery_routes")
            .select("id", { count: "exact", head: true })
            .not("driver_access_token" as never, "is", null),
          supabase.from("route_point_photos").select("id", { count: "exact", head: true }),
          supabase
            .from("route_point_photos")
            .select("id", { count: "exact", head: true })
            .eq("kind" as never, "qr"),
          supabase
            .from("route_points")
            .select("id", { count: "exact", head: true })
            .gt("dp_amount_received" as never, 0),
          supabase.from("delivery_reports").select("id", { count: "exact", head: true }),
          supabase
            .from("delivery_routes")
            .select("id", { count: "exact", head: true })
            .eq("status" as never, "completed"),
          supabase
            .from("route_points")
            .select("id", { count: "exact", head: true })
            .eq("status" as never, "returned_to_warehouse"),
          supabase.from("notifications").select("id", { count: "exact", head: true }),
        ]);
      return {
        routes: (routes.count ?? 0) > 0,
        driverLink: (tokens.count ?? 0) > 0,
        photos: (photos.count ?? 0) > 0,
        qr: (qrPhotos.count ?? 0) > 0,
        cash: (cashPay.count ?? 0) > 0,
        managerReport: (reports.count ?? 0) > 0,
        directorReport: (completedRoutes.count ?? 0) > 0,
        warehouseReturns: (returns.count ?? 0) > 0,
        notifications: (notifs.count ?? 0) > 0,
      };
    },
    refetchInterval: 5000,
  });

  const testRoutes = useQuery({
    queryKey: ["pilot-test-routes"],
    queryFn: async (): Promise<TestRoute[]> => {
      const { data, error } = await supabase
        .from("delivery_routes")
        .select("id, route_number, route_date, status, assigned_driver, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      const rows = (data ?? []) as TestRoute[];
      // Подсчёт точек по каждому маршруту
      const ids = rows.map((r) => r.id);
      if (ids.length > 0) {
        const { data: pts } = await supabase
          .from("route_points")
          .select("route_id")
          .in("route_id", ids);
        const counts = new Map<string, number>();
        (pts ?? []).forEach((p: { route_id: string }) => {
          counts.set(p.route_id, (counts.get(p.route_id) ?? 0) + 1);
        });
        rows.forEach((r) => {
          r.points_count = counts.get(r.id) ?? 0;
        });
      }
      return rows;
    },
    refetchInterval: 10000,
  });

  const issues = useQuery({
    queryKey: ["pilot-issues"],
    queryFn: async (): Promise<SystemIssue[]> => {
      const { data, error } = await supabase
        .from("system_issues")
        .select("id, title, severity, status, role, location, created_at")
        .neq("status", "done")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as SystemIssue[];
    },
    refetchInterval: 10000,
  });

  const r = readiness.data;
  const readyCount = r ? Object.values(r).filter(Boolean).length : 0;
  const totalReady = Object.keys(READINESS_LABELS).length;
  const allReady = readyCount === totalReady;

  const start = () => {
    setState("running");
    saveState("running");
  };
  const finish = () => {
    setState("finished");
    saveState("finished");
  };
  const reset = () => {
    if (!confirm("Сбросить статус пилота?")) return;
    setState("idle");
    saveState("idle");
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Пилотный запуск</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Подготовка системы к первому рабочему тесту: проверьте готовность, пройдите чек-лист и
              запустите пилот.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <PilotStateBadge state={state} />
            {state !== "idle" && (
              <Button variant="outline" size="sm" onClick={reset}>
                <RotateCcw className="mr-2 h-4 w-4" /> Сбросить
              </Button>
            )}
          </div>
        </div>

        {state === "finished" && (
          <div className="mb-6 rounded-lg border border-green-300 bg-green-50 p-5 text-green-900 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200">
            <div className="flex items-center gap-3">
              <PartyPopper className="h-6 w-6" />
              <div>
                <div className="text-lg font-semibold">Пилот завершён</div>
                <div className="text-sm opacity-80">
                  Можно подвести итоги по тестовым маршрутам и зафиксированным ошибкам.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Готовность системы */}
        <section className="mb-6 rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">Готовность системы</h2>
            <div className="text-xs text-muted-foreground">
              {readiness.isLoading ? "Проверка…" : `${readyCount} из ${totalReady}`}
            </div>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(READINESS_LABELS) as ReadinessKey[]).map((k) => {
              const ok = r?.[k] ?? false;
              return (
                <li
                  key={k}
                  className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <span>{READINESS_LABELS[k]}</span>
                  {readiness.isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : ok ? (
                    <span className="inline-flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="h-4 w-4" /> готово
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <XCircle className="h-4 w-4" /> нет данных
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Управление пилотом */}
        <section className="mb-6 rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-3 text-base font-semibold">Управление пилотом</h2>
          {!allReady && state === "idle" && (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                Не все блоки готовы ({readyCount} из {totalReady}). Можно начать пилот, чтобы
                проверить недостающее в реальном сценарии.
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={start} disabled={state === "running"} className="gap-2">
              <PlayCircle className="h-4 w-4" />
              Начать пилот
            </Button>
            <Button
              variant="outline"
              onClick={finish}
              disabled={state !== "running"}
              className="gap-2"
            >
              <StopCircle className="h-4 w-4" />
              Завершить пилот
            </Button>
          </div>
        </section>

        {/* Чек-лист сценария */}
        <section className="mb-6 rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold">Чек-лист сценария</h2>
          <ol className="space-y-2">
            {CHECKLIST.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
                    {s.id}
                  </span>
                  <span className="truncate text-sm">{s.title}</span>
                </div>
                <Link to={s.to}>
                  <Button variant="outline" size="sm">
                    {s.cta}
                  </Button>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        {/* Тестовые маршруты */}
        <section className="mb-6 rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">Тестовые маршруты</h2>
            <div className="text-xs text-muted-foreground">
              Последние 10 маршрутов
            </div>
          </div>
          {testRoutes.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
            </div>
          ) : (testRoutes.data ?? []).length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
              Пока нет ни одного маршрута. Создайте первый в кабинете логиста.
            </div>
          ) : (
            <ul className="space-y-2">
              {testRoutes.data!.map((rt) => (
                <li
                  key={rt.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <RouteIcon className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-semibold">№{rt.route_number}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {new Date(rt.route_date).toLocaleDateString("ru-RU")}
                        {" · "}
                        {rt.assigned_driver ?? "водитель не назначен"}
                        {" · "}
                        точек: {rt.points_count ?? 0}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={DELIVERY_ROUTE_STATUS_STYLES[rt.status]}
                    >
                      {DELIVERY_ROUTE_STATUS_LABELS[rt.status]}
                    </Badge>
                    <Link
                      to="/delivery-routes/$deliveryRouteId"
                      params={{ deliveryRouteId: rt.id }}
                    >
                      <Button size="sm" variant="outline">
                        Открыть
                      </Button>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Ошибки */}
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">Открытые ошибки</h2>
            <Link to="/system-issues">
              <Button size="sm" variant="outline">
                Все ошибки
              </Button>
            </Link>
          </div>
          {issues.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
            </div>
          ) : (issues.data ?? []).length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
              Открытых ошибок нет.
            </div>
          ) : (
            <ul className="space-y-2">
              {issues.data!.map((it) => (
                <li
                  key={it.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{it.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {it.role}
                      {it.location ? ` · ${it.location}` : ""}
                      {" · "}
                      {new Date(it.created_at).toLocaleString("ru-RU")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{it.severity}</Badge>
                    <Badge variant="outline">{it.status}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function PilotStateBadge({ state }: { state: PilotState }) {
  if (state === "running") {
    return (
      <Badge className="bg-primary text-primary-foreground border-primary">
        Пилот идёт
      </Badge>
    );
  }
  if (state === "finished") {
    return (
      <Badge variant="outline" className="bg-green-100 text-green-900 border-green-200">
        Завершён
      </Badge>
    );
  }
  return <Badge variant="outline">Не запущен</Badge>;
}
