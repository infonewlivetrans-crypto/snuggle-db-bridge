import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, PlayCircle, PartyPopper, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/first-run")({
  head: () => ({
    meta: [
      { title: "Первый запуск — Радиус Трек" },
      { name: "description", content: "Подготовка минимального контура к первому рабочему тесту." },
    ],
  }),
  component: FirstRunPage,
});

const STORAGE_KEY = "first_run_completed_v1";

const STEPS = [
  { id: 1, title: "Создать маршрут", to: "/logist", cta: "Открыть кабинет логиста" },
  { id: 2, title: "Добавить точки", to: "/delivery-routes", cta: "Перейти к маршрутам" },
  { id: 3, title: "Выдать водителю", to: "/delivery-routes", cta: "К маршрутам" },
  { id: 4, title: "Открыть ссылку водителя", to: "/driver", cta: "Кабинет водителя" },
  { id: 5, title: "Закрыть точки (доставлено / не доставлено / возврат)", to: "/driver", cta: "Кабинет водителя" },
  { id: 6, title: "Завершить маршрут", to: "/driver", cta: "Кабинет водителя" },
  { id: 7, title: "Проверить отчёт менеджера", to: "/route-reports", cta: "Отчёты по маршрутам" },
  { id: 8, title: "Проверить отчёт руководителя", to: "/director", cta: "Отчёт руководителя" },
] as const;

type ReadinessKey =
  | "routes"
  | "driverLink"
  | "photos"
  | "qr"
  | "cash"
  | "managerReport"
  | "notifications";

const READINESS_LABELS: Record<ReadinessKey, string> = {
  routes: "Маршруты работают",
  driverLink: "Водительская ссылка работает",
  photos: "Загрузка фото работает",
  qr: "QR фиксируется",
  cash: "Наличка фиксируется",
  managerReport: "Отчёт менеджеру формируется",
  notifications: "Уведомления работают",
};

function FirstRunPage() {
  const [started, setStarted] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY + "_started") === "1";
  });
  const [completed, setCompleted] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "1";
  });

  const readiness = useQuery({
    queryKey: ["first-run-readiness"],
    queryFn: async (): Promise<Record<ReadinessKey, boolean>> => {
      const [routes, tokens, photos, qrPhotos, cashPay, reports, notifs] = await Promise.all([
        supabase.from("delivery_routes").select("id", { count: "exact", head: true }),
        supabase.from("delivery_routes").select("id", { count: "exact", head: true }).not("driver_access_token" as never, "is", null),
        supabase.from("route_point_photos").select("id", { count: "exact", head: true }),
        supabase.from("route_point_photos").select("id", { count: "exact", head: true }).eq("kind" as never, "qr"),
        supabase.from("route_points").select("id", { count: "exact", head: true }).gt("dp_amount_received" as never, 0),
        supabase.from("delivery_reports").select("id", { count: "exact", head: true }),
        supabase.from("notifications").select("id", { count: "exact", head: true }),
      ]);
      return {
        routes: (routes.count ?? 0) > 0,
        driverLink: (tokens.count ?? 0) > 0,
        photos: (photos.count ?? 0) > 0,
        qr: (qrPhotos.count ?? 0) > 0,
        cash: (cashPay.count ?? 0) > 0,
        managerReport: (reports.count ?? 0) > 0,
        notifications: (notifs.count ?? 0) > 0,
      };
    },
    refetchInterval: 5000,
  });

  const start = () => {
    setStarted(true);
    localStorage.setItem(STORAGE_KEY + "_started", "1");
  };
  const finish = () => {
    setCompleted(true);
    localStorage.setItem(STORAGE_KEY, "1");
  };
  const reset = () => {
    if (!confirm("Сбросить прогресс первого запуска?")) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY + "_started");
    setStarted(false);
    setCompleted(false);
  };

  const r = readiness.data;
  const readyCount = r ? Object.values(r).filter(Boolean).length : 0;
  const totalReady = Object.keys(READINESS_LABELS).length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Первый запуск</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Подготовка минимального контура к первому рабочему тесту.
          </p>
        </div>
        {(started || completed) && (
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="mr-2 h-4 w-4" /> Сбросить
          </Button>
        )}
      </div>

      {completed && (
        <div className="mb-6 rounded-lg border border-green-300 bg-green-50 p-5 text-green-900 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200">
          <div className="flex items-center gap-3">
            <PartyPopper className="h-6 w-6" />
            <div>
              <div className="text-lg font-semibold">Минимальный контур готов к пилотному запуску</div>
              <div className="text-sm opacity-80">Можно переходить к работе с реальными маршрутами.</div>
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
                    <CheckCircle2 className="h-4 w-4" /> да
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <XCircle className="h-4 w-4" /> нет
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Старт теста */}
      {!started && !completed && (
        <div className="mb-6 flex justify-center">
          <Button size="lg" onClick={start} className="gap-2">
            <PlayCircle className="h-5 w-5" />
            Начать тест
          </Button>
        </div>
      )}

      {/* Шаги */}
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold">Порядок теста</h2>
        <ol className="space-y-2">
          {STEPS.map((s) => (
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

        {started && !completed && (
          <div className="mt-5 flex justify-end">
            <Button onClick={finish} className="gap-2">
              <CheckCircle2 className="h-5 w-5" />
              Завершить тест
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
