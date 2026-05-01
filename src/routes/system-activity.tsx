import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, Loader2, RefreshCw, UserMinus } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS, type AppRole } from "@/lib/auth/roles";
import { systemActivityFn } from "@/lib/server-functions/system-activity.functions";

export const Route = createFileRoute("/system-activity")({
  head: () => ({ meta: [{ title: "Активность системы — Радиус Трек" }] }),
  component: SystemActivityPage,
});

function Kpi({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className={`text-2xl font-semibold ${accent ?? ""}`}>{value}</CardContent>
    </Card>
  );
}

function WeekChart({ data }: { data: Array<{ date: string; actions: number; users: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.actions));
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-7 items-end gap-2 h-40">
        {data.map((d) => {
          const h = Math.round((d.actions / max) * 100);
          const dt = new Date(d.date);
          const label = dt.toLocaleDateString("ru-RU", { weekday: "short", day: "2-digit" });
          return (
            <div key={d.date} className="flex flex-col items-center gap-1">
              <div className="text-xs text-muted-foreground">{d.actions}</div>
              <div
                className="w-full rounded-t bg-primary/70"
                style={{ height: `${h}%`, minHeight: 4 }}
                title={`${d.date}: ${d.actions} действий, ${d.users} пользователей`}
              />
              <div className="text-[11px] text-muted-foreground">{label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SystemActivityPage() {
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["system-activity"],
    queryFn: () => systemActivityFn({ data: undefined }),
    refetchInterval: 60_000,
  });

  const ROLES_TO_SHOW: AppRole[] = ["driver", "logist", "manager", "warehouse", "director"];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1200px] px-3 py-6 sm:px-4 lg:px-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <Activity className="h-6 w-6" /> Активность системы
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Контроль использования системы в реальной работе. Доступно администратору и руководителю.
            </p>
          </div>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Обновить
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка…
          </div>
        ) : error ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-destructive">
              {error instanceof Error ? error.message : "Не удалось загрузить данные"}
            </CardContent>
          </Card>
        ) : data ? (
          <div className="space-y-4">
            {/* Предупреждения */}
            {data.warnings.length > 0 ? (
              <Card className="border-destructive/40 bg-destructive/5">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-destructive">
                    <AlertTriangle className="h-4 w-4" /> Предупреждения
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1 text-sm">
                    {data.warnings.map((w, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
                        <span>{w.text}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}

            {/* KPI за сегодня */}
            <div>
              <div className="mb-2 text-sm font-semibold text-muted-foreground">
                Сегодня · {new Date(data.today).toLocaleDateString("ru-RU")}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi label="Пользователей зашло" value={data.kpi.usersToday} />
                <Kpi label="Маршрутов создано" value={data.kpi.routesCreatedToday} />
                <Kpi label="Маршрутов завершено" value={data.kpi.routesCompletedToday} accent="text-emerald-700 dark:text-emerald-400" />
                <Kpi label="Заказов обработано" value={data.kpi.ordersProcessedToday} />
                <Kpi label="Точек закрыто" value={data.kpi.pointsClosedToday} />
                <Kpi label="Отчётов сдано" value={data.kpi.reportsToday} />
                <Kpi label="Ошибок системы" value={data.kpi.errorsToday} accent={data.kpi.errorsToday > 0 ? "text-destructive" : ""} />
              </div>
            </div>

            {/* Активность по ролям */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Активность по ролям (действий за сегодня)</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {ROLES_TO_SHOW.map((r) => {
                    const v = (data.byRole as Record<string, number>)[r] ?? 0;
                    return (
                      <li key={r} className="flex items-center justify-between rounded border border-border bg-background px-3 py-2 text-sm">
                        <span>{ROLE_LABELS[r]}</span>
                        <Badge variant={v === 0 ? "outline" : "default"} className={v === 0 ? "text-muted-foreground" : ""}>
                          {v}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>

            {/* График за 7 дней */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Активность за 7 дней</CardTitle>
              </CardHeader>
              <CardContent>
                <WeekChart data={data.weekChart} />
              </CardContent>
            </Card>

            {/* Кто не работает */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <UserMinus className="h-4 w-4" /> Кто не работает в системе сегодня
                  <Badge variant="outline" className="ml-2">{data.inactiveTotal}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.inactiveToday.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Все активные пользователи заходили сегодня.</div>
                ) : (
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {data.inactiveToday.map((u) => (
                      <div key={u.userId} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-background px-3 py-1.5 text-sm">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{u.name ?? u.email ?? "—"}</div>
                          {u.email && u.name ? (
                            <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {u.roles.length === 0 ? (
                            <Badge variant="outline" className="text-muted-foreground">без роли</Badge>
                          ) : (
                            u.roles.map((r) => (
                              <Badge key={r} variant="secondary">
                                {ROLE_LABELS[r as AppRole] ?? r}
                              </Badge>
                            ))
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </main>
    </div>
  );
}
