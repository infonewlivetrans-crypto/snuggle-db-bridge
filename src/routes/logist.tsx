import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Route as RouteIcon,
  AlertTriangle,
  Camera,
  ChevronRight,
  ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import {
  DELIVERY_ROUTE_STATUS_LABELS,
  DELIVERY_ROUTE_STATUS_STYLES,
  type DeliveryRouteStatus,
} from "@/lib/deliveryRoutes";

export const Route = createFileRoute("/logist")({
  head: () => ({
    meta: [
      { title: "Кабинет логиста — Радиус Трек" },
      { name: "description", content: "Контроль маршрутов и проблемных доставок" },
    ],
  }),
  component: LogistPage,
});

type RouteRow = {
  id: string;
  route_number: string;
  route_date: string;
  status: DeliveryRouteStatus;
  assigned_driver: string | null;
  assigned_vehicle: string | null;
};

type PointTotals = {
  total: number;
  delivered: number;
  not_delivered: number;
  returned: number;
};

type PointRow = {
  route_id: string;
  dp_status: string;
};

type ProblemRow = {
  id: string;
  order_id: string;
  route_id: string | null;
  reason: string;
  comment: string | null;
  photo_url: string | null;
  urgency: "normal" | "urgent";
  reported_by: string | null;
  resolution_status: "new" | "in_progress" | "resolved";
  logist_comment: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  order: { order_number: string; contact_name: string | null } | null;
  route: { route_number: string } | null;
};

type StatusFilter = DeliveryRouteStatus | "problems" | "all";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "draft", label: "Черновик" },
  { key: "formed", label: "Проверен" },
  { key: "issued", label: "Выдан водителю" },
  { key: "in_progress", label: "В работе" },
  { key: "completed", label: "Завершён" },
  { key: "problems", label: "Есть проблемы" },
];

const PROBLEM_STATUS_LABEL: Record<string, string> = {
  new: "Новая",
  in_progress: "В работе",
  resolved: "Решена",
};

const PROBLEM_STATUS_TONE: Record<string, string> = {
  new: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
  in_progress: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200",
  resolved: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

function LogistPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [driverFilter, setDriverFilter] = useState<string>("all");
  const [openProblem, setOpenProblem] = useState<ProblemRow | null>(null);

  const { data: routes = [], isLoading: routesLoading } = useQuery({
    queryKey: ["logist-routes"],
    queryFn: async (): Promise<RouteRow[]> => {
      const { data, error } = await supabase
        .from("delivery_routes")
        .select("id, route_number, route_date, status, assigned_driver, assigned_vehicle")
        .order("route_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as RouteRow[];
    },
  });

  const { data: points = [] } = useQuery({
    queryKey: ["logist-route-points-summary"],
    queryFn: async (): Promise<PointRow[]> => {
      const { data, error } = await supabase
        .from("route_points")
        .select("route_id, dp_status")
        .limit(10000);
      if (error) throw error;
      return (data ?? []) as PointRow[];
    },
  });

  const { data: problems = [], isLoading: problemsLoading } = useQuery({
    queryKey: ["logist-problems"],
    queryFn: async (): Promise<ProblemRow[]> => {
      const { data, error } = await supabase
        .from("order_problem_reports")
        .select(
          "id, order_id, route_id, reason, comment, photo_url, urgency, reported_by, resolution_status, logist_comment, resolved_by, resolved_at, created_at, order:order_id(order_number, contact_name), route:route_id(route_number)",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as ProblemRow[];
    },
  });

  const totalsByRoute = useMemo(() => {
    const m = new Map<string, PointTotals>();
    for (const p of points) {
      const t = m.get(p.route_id) ?? { total: 0, delivered: 0, not_delivered: 0, returned: 0 };
      t.total++;
      if (p.dp_status === "delivered") t.delivered++;
      else if (p.dp_status === "not_delivered") t.not_delivered++;
      else if (p.dp_status === "returned_to_warehouse") t.returned++;
      m.set(p.route_id, t);
    }
    return m;
  }, [points]);

  const routesWithProblems = useMemo(() => {
    const set = new Set<string>();
    for (const pr of problems) {
      if (pr.route_id && pr.resolution_status !== "resolved") set.add(pr.route_id);
    }
    return set;
  }, [problems]);

  const driverOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of routes) if (r.assigned_driver) set.add(r.assigned_driver);
    return Array.from(set).sort();
  }, [routes]);

  const filteredRoutes = useMemo(() => {
    return routes.filter((r) => {
      if (dateFrom && r.route_date < dateFrom) return false;
      if (dateTo && r.route_date > dateTo) return false;
      if (driverFilter !== "all" && r.assigned_driver !== driverFilter) return false;
      if (statusFilter === "all") return true;
      if (statusFilter === "problems") return routesWithProblems.has(r.id);
      return r.status === statusFilter;
    });
  }, [routes, dateFrom, dateTo, driverFilter, statusFilter, routesWithProblems]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-6">
        <div className="mb-3 flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary sm:h-6 sm:w-6" />
          <h1 className="text-lg font-bold sm:text-2xl">Кабинет логиста</h1>
        </div>
        <p className="mb-4 text-xs text-muted-foreground sm:text-sm">
          Контроль маршрутов и проблемных доставок.
        </p>

        {/* Статусные фильтры */}
        <div className="mb-3 -mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {STATUS_FILTERS.map((f) => {
            const active = statusFilter === f.key;
            const count =
              f.key === "all"
                ? routes.length
                : f.key === "problems"
                  ? routes.filter((r) => routesWithProblems.has(r.id)).length
                  : routes.filter((r) => r.status === f.key).length;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatusFilter(f.key)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-foreground hover:bg-secondary"
                }`}
              >
                {f.label}
                <span
                  className={`ml-0.5 rounded-full px-1.5 text-[10px] ${
                    active ? "bg-background/20 text-background" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Фильтры по дате и водителю */}
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">Дата с</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">Дата по</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
          <div className="col-span-2 sm:col-span-2">
            <label className="mb-1 block text-[11px] text-muted-foreground">Водитель</label>
            <Select value={driverFilter} onValueChange={setDriverFilter}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все водители</SelectItem>
                {driverOptions.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Маршруты */}
        <div className="mb-6">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <RouteIcon className="h-4 w-4 text-muted-foreground" />
            Маршруты ({filteredRoutes.length})
          </h2>
          {routesLoading ? (
            <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              Загрузка...
            </div>
          ) : filteredRoutes.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              Маршрутов нет
            </div>
          ) : (
            <div className="space-y-2">
              {filteredRoutes.map((r) => {
                const t = totalsByRoute.get(r.id) ?? {
                  total: 0,
                  delivered: 0,
                  not_delivered: 0,
                  returned: 0,
                };
                const hasProblem = routesWithProblems.has(r.id);
                return (
                  <Link
                    key={r.id}
                    to="/delivery-routes/$deliveryRouteId"
                    params={{ deliveryRouteId: r.id }}
                    className="block rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{r.route_number}</span>
                          <Badge variant="outline" className={DELIVERY_ROUTE_STATUS_STYLES[r.status]}>
                            {DELIVERY_ROUTE_STATUS_LABELS[r.status]}
                          </Badge>
                          {hasProblem && (
                            <Badge variant="outline" className="border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300">
                              <AlertTriangle className="mr-1 h-3 w-3" />
                              Проблема
                            </Badge>
                          )}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {new Date(r.route_date).toLocaleDateString("ru-RU")}
                          {r.assigned_driver ? ` · ${r.assigned_driver}` : ""}
                          {r.assigned_vehicle ? ` · ${r.assigned_vehicle}` : ""}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-2 text-[11px]">
                      <Stat label="Точек" value={String(t.total)} />
                      <Stat label="Дост." value={String(t.delivered)} tone="emerald" />
                      <Stat label="Не дост." value={String(t.not_delivered)} tone="red" />
                      <Stat label="Возврат" value={String(t.returned)} tone="orange" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Проблемные доставки */}
        <div>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            Проблемные доставки ({problems.length})
          </h2>
          {problemsLoading ? (
            <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              Загрузка...
            </div>
          ) : problems.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              Проблемных доставок нет
            </div>
          ) : (
            <div className="space-y-2">
              {problems.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setOpenProblem(p)}
                  className="block w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        № {p.order?.order_number ?? "—"}
                      </span>
                      {p.route?.route_number && (
                        <span className="text-xs text-muted-foreground">
                          · Маршрут {p.route.route_number}
                        </span>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={PROBLEM_STATUS_TONE[p.resolution_status] ?? ""}
                    >
                      {PROBLEM_STATUS_LABEL[p.resolution_status] ?? p.resolution_status}
                    </Badge>
                  </div>
                  <div className="mt-1 text-sm">{p.reason}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    {p.reported_by && <span>Водитель: {p.reported_by}</span>}
                    <span>{new Date(p.created_at).toLocaleString("ru-RU")}</span>
                    {p.urgency === "urgent" && (
                      <span className="font-medium text-red-600">Срочная</span>
                    )}
                    {p.photo_url && (
                      <span className="inline-flex items-center gap-1">
                        <Camera className="h-3 w-3" /> фото
                      </span>
                    )}
                  </div>
                  {p.comment && (
                    <div className="mt-1 line-clamp-2 text-xs italic text-muted-foreground">
                      {p.comment}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </main>

      <ProblemDialog
        problem={openProblem}
        onClose={() => setOpenProblem(null)}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "emerald" | "red" | "orange";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "red"
        ? "text-red-600"
        : tone === "orange"
          ? "text-orange-600"
          : "";
  return (
    <div className="rounded border border-border bg-muted/30 px-1.5 py-1 text-center">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function ProblemDialog({
  problem,
  onClose,
}: {
  problem: ProblemRow | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"new" | "in_progress" | "resolved">("new");
  const [comment, setComment] = useState("");

  // Sync state when opening
  useMemo(() => {
    if (problem) {
      setStatus(problem.resolution_status);
      setComment(problem.logist_comment ?? "");
    }
  }, [problem]);

  const save = useMutation({
    mutationFn: async () => {
      if (!problem) return;
      const patch: Record<string, unknown> = {
        resolution_status: status,
        logist_comment: comment.trim() || null,
      };
      if (status === "resolved") {
        patch.resolved_by = "Логист";
        patch.resolved_at = new Date().toISOString();
      } else {
        patch.resolved_at = null;
      }
      const { error } = await supabase
        .from("order_problem_reports")
        .update(patch)
        .eq("id", problem.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Сохранено");
      qc.invalidateQueries({ queryKey: ["logist-problems"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!problem} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Проблемная доставка</DialogTitle>
          <DialogDescription>
            {problem?.order?.order_number ? `Заказ № ${problem.order.order_number}` : ""}
            {problem?.route?.route_number ? ` · Маршрут ${problem.route.route_number}` : ""}
          </DialogDescription>
        </DialogHeader>

        {problem && (
          <div className="space-y-3 text-sm">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Причина
              </div>
              <div className="mt-0.5">{problem.reason}</div>
            </div>

            {problem.comment && (
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Комментарий водителя
                </div>
                <div className="mt-0.5 italic">{problem.comment}</div>
              </div>
            )}

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {problem.reported_by && <span>Водитель: {problem.reported_by}</span>}
              <span>{new Date(problem.created_at).toLocaleString("ru-RU")}</span>
              {problem.urgency === "urgent" && (
                <span className="font-medium text-red-600">Срочная</span>
              )}
            </div>

            {problem.photo_url && (
              <a
                href={problem.photo_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Camera className="h-3 w-3" /> Открыть фото проблемы
              </a>
            )}

            <div className="border-t border-border pt-3">
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
                Статус
              </label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">Новая</SelectItem>
                  <SelectItem value="in_progress">В работе</SelectItem>
                  <SelectItem value="resolved">Решена</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
                Комментарий логиста
              </label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Что предпринято / решение"
              />
            </div>

            {problem.resolved_by && problem.resolved_at && (
              <div className="text-[11px] text-muted-foreground">
                Решено: {problem.resolved_by} ·{" "}
                {new Date(problem.resolved_at).toLocaleString("ru-RU")}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
