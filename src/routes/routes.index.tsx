import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { CreateRouteDialog } from "@/components/CreateRouteDialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type DeliveryRoute,
  type RouteStatus,
  ROUTE_STATUS_LABELS,
  ROUTE_STATUS_ORDER,
  ROUTE_STATUS_STYLES,
  REQUEST_TYPE_LABELS,
  REQUEST_TYPE_STYLES,
} from "@/lib/routes";
import { Search, Plus, RefreshCw, Route as RouteIcon, Calendar, User, Scale, Box } from "lucide-react";

type RouteWithCount = DeliveryRoute & { points_count: number };

export const Route = createFileRoute("/routes/")({
  head: () => ({
    meta: [
      { title: "Маршруты — Радиус Трек" },
      { name: "description", content: "Управление маршрутами доставки" },
    ],
  }),
  component: RoutesPage,
});

function RoutesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RouteStatus | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);

  const { data: routes, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["routes"],
    queryFn: async (): Promise<RouteWithCount[]> => {
      const { data, error } = await supabase
        .from("routes")
        .select("*, route_points(count)")
        .order("route_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: DeliveryRoute & { route_points: { count: number }[] }) => ({
        ...r,
        points_count: r.route_points?.[0]?.count ?? 0,
      }));
    },
  });

  const filtered = useMemo(() => {
    if (!routes) return [];
    return routes.filter((r) => {
      const matchSearch =
        !search ||
        r.route_number.toLowerCase().includes(search.toLowerCase()) ||
        (r.driver_name?.toLowerCase().includes(search.toLowerCase()) ?? false);
      const matchStatus = statusFilter === "all" || r.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [routes, search, statusFilter]);

  const stats = useMemo(() => {
    if (!routes) return { total: 0, planned: 0, inProgress: 0, completed: 0 };
    return {
      total: routes.length,
      planned: routes.filter((r) => r.status === "planned").length,
      inProgress: routes.filter((r) => r.status === "in_progress").length,
      completed: routes.filter((r) => r.status === "completed").length,
    };
  }, [routes]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Маршруты доставки
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Планирование и управление маршрутами водителей
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Обновить
            </Button>
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Создать маршрут
            </Button>
          </div>
        </div>

        {/* Статистика */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Всего" value={stats.total} accent />
          <StatCard label="Запланировано" value={stats.planned} />
          <StatCard label="В пути" value={stats.inProgress} />
          <StatCard label="Выполнено" value={stats.completed} />
        </div>

        {/* Фильтры */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Поиск по номеру или водителю..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as RouteStatus | "all")}
          >
            <SelectTrigger className="sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              {ROUTE_STATUS_ORDER.map((s) => (
                <SelectItem key={s} value={s}>
                  {ROUTE_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Таблица */}
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                <TableHead className="font-semibold text-foreground">Номер</TableHead>
                <TableHead className="font-semibold text-foreground">Тип</TableHead>
                <TableHead className="font-semibold text-foreground">Дата</TableHead>
                <TableHead className="font-semibold text-foreground">Водитель</TableHead>
                <TableHead className="font-semibold text-foreground">Точек</TableHead>
                <TableHead className="font-semibold text-foreground">Груз</TableHead>
                <TableHead className="font-semibold text-foreground">Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                    Загрузка маршрутов...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center">
                    <RouteIcon className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                    <div className="text-sm text-muted-foreground">Маршруты не найдены</div>
                    <Button
                      onClick={() => setCreateOpen(true)}
                      className="mt-3 gap-2"
                      size="sm"
                    >
                      <Plus className="h-4 w-4" />
                      Создать первый маршрут
                    </Button>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer">
                    <TableCell>
                      <Link
                        to="/routes/$routeId"
                        params={{ routeId: r.id }}
                        className="font-mono text-sm font-semibold text-foreground hover:underline"
                      >
                        {r.route_number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="inline-flex items-center gap-1.5 text-foreground">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        {new Date(r.route_date).toLocaleDateString("ru-RU")}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="inline-flex items-center gap-1.5 text-foreground">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        {r.driver_name ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm font-medium text-foreground">
                      {r.points_count}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={ROUTE_STATUS_STYLES[r.status]}>
                        {ROUTE_STATUS_LABELS[r.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </main>

      <CreateRouteDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        accent ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
      }`}
    >
      <div
        className={`text-xs font-medium uppercase tracking-wider ${
          accent ? "text-primary-foreground/80" : "text-muted-foreground"
        }`}
      >
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
