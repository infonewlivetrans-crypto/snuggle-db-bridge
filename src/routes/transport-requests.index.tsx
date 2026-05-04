import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CACHE_TIMES } from "@/lib/queryCache";
import { useMemo, useState } from "react";
import { fetchListViaApi } from "@/lib/api-client";
import { AppHeader } from "@/components/AppHeader";
import { LoadingFallback } from "@/components/LoadingFallback";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, ClipboardList, AlertTriangle } from "lucide-react";
import {
  PRIORITY_LABELS,
  PRIORITY_BADGE_CLASS,
  type RequestPriority,
} from "@/lib/requestPriority";
import { RequestWarehouseStatusBadge } from "@/components/RequestWarehouseStatusBadge";

export const Route = createFileRoute("/transport-requests/")({
  head: () => ({
    meta: [
      { title: "Заявки на транспорт — Радиус Трек" },
      { name: "description", content: "Список заявок на транспорт" },
    ],
  }),
  component: TransportRequestsPage,
});

export const REQUEST_TYPE_LABELS: Record<string, string> = {
  client_delivery: "Доставка клиентам",
  warehouse_transfer: "Перемещение между складами",
  factory_to_warehouse: "С завода на склад",
};

export const REQUEST_STATUS_LABELS: Record<string, string> = {
  planned: "Запланирована",
  loading: "Погрузка",
  in_progress: "В работе",
  completed: "Завершена",
  cancelled: "Отменена",
};

type RequestRow = {
  id: string;
  route_number: string;
  request_type: string;
  status: string;
  request_status?: string | null;
  route_date: string;
  departure_time: string | null;
  request_priority: RequestPriority;
  warehouse_id: string | null;
  destination_warehouse_id: string | null;
  points_count: number;
  total_weight_kg: number;
  total_volume_m3: number;
  delivery_cost?: number | null;
  carrier_cost?: number | null;
  carrier_payment_status?: string | null;
  warehouses?: { name: string; address?: string | null } | null;
  destination?: { name: string; address?: string | null } | null;
  carrier?: { company_name: string | null } | null;
  driver?: { full_name: string | null; phone: string | null } | null;
  vehicle?: { plate_number: string | null } | null;
};

function TransportRequestsPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const [pageSize, setPageSize] = useState(20);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["transport-requests", pageSize, typeFilter],
    queryFn: async (): Promise<RequestRow[]> => {
      const { rows } = await fetchListViaApi<RequestRow>("/api/transport-requests", {
        limit: pageSize,
        extra: { type: typeFilter },
      });
      return rows;
    },
    staleTime: CACHE_TIMES.BUSINESS,
    placeholderData: (prev) => prev,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((r) => {
      const matchSearch =
        !search || r.route_number.toLowerCase().includes(search.toLowerCase());
      const matchType = typeFilter === "all" || r.request_type === typeFilter;
      return matchSearch && matchType;
    });
  }, [data, search, typeFilter]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Заявки на транспорт
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Все заявки: доставка клиентам, перемещения между складами, поставки с завода
          </p>
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Поиск по номеру..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все типы</SelectItem>
              {Object.entries(REQUEST_TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Mobile cards */}
        <div className="space-y-3 md:hidden">
          {isLoading ? (
            <LoadingFallback onRefresh={() => refetch()} />
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-8 text-center">
              <ClipboardList className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <div className="text-sm text-muted-foreground">Заявки не найдены</div>
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-3 inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                Обновить
              </button>
            </div>
          ) : (
            filtered.map((r) => (
              <Link
                key={r.id}
                to="/transport-requests/$requestId"
                params={{ requestId: r.id }}
                className="block rounded-lg border border-border bg-card p-3 active:bg-accent/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-base font-semibold text-primary">
                      {r.route_number}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {REQUEST_TYPE_LABELS[r.request_type] ?? r.request_type}
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {REQUEST_STATUS_LABELS[r.status] ?? r.status}
                  </Badge>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <Cell label="Перевозчик" value={r.carrier?.company_name ?? "—"} />
                  <Cell label="Водитель" value={r.driver?.full_name ?? "—"} />
                  <Cell
                    label="Загрузка"
                    value={r.warehouses?.address || r.warehouses?.name || "—"}
                  />
                  <Cell
                    label="Доставка"
                    value={r.destination?.address || r.destination?.name || "—"}
                  />
                  <Cell
                    label="Дата/время"
                    value={
                      <>
                        {r.route_date
                          ? new Date(r.route_date).toLocaleDateString("ru-RU")
                          : "—"}
                        {r.departure_time ? (
                          <span className="ml-1 font-mono">
                            {r.departure_time.slice(0, 5)}
                          </span>
                        ) : null}
                      </>
                    }
                  />
                  <Cell
                    label="Сумма"
                    value={
                      r.delivery_cost
                        ? `${Number(r.delivery_cost).toLocaleString("ru-RU")} ₽`
                        : "—"
                    }
                  />
                  <Cell
                    label="Оплата"
                    value={
                      r.carrier_payment_status === "approved" ||
                      r.carrier_payment_status === "to_pay"
                        ? "К оплате"
                        : r.carrier_payment_status === "calculated"
                          ? "Рассчитано"
                          : "—"
                    }
                  />
                  <Cell label="QR" value="нет" />
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${PRIORITY_BADGE_CLASS[r.request_priority]}`}
                  >
                    {PRIORITY_LABELS[r.request_priority]}
                  </span>
                  <RequestWarehouseStatusBadge
                    requestId={r.id}
                    warehouseId={r.warehouse_id}
                  />
                </div>
              </Link>
            ))
          )}
        </div>

        <div className="hidden overflow-x-auto rounded-lg border border-border bg-card md:block">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                <TableHead className="font-semibold text-foreground">Номер</TableHead>
                <TableHead className="font-semibold text-foreground">Тип</TableHead>
                <TableHead className="font-semibold text-foreground">Статус</TableHead>
                <TableHead className="font-semibold text-foreground">Склад</TableHead>
                <TableHead className="font-semibold text-foreground">Склад отправления</TableHead>
                <TableHead className="font-semibold text-foreground">Склад назначения</TableHead>
                <TableHead className="font-semibold text-foreground">Дата отправки</TableHead>
                <TableHead className="font-semibold text-foreground">Время</TableHead>
                <TableHead className="font-semibold text-foreground">Приоритет</TableHead>
                <TableHead className="text-right font-semibold text-foreground">Заказов</TableHead>
                <TableHead className="text-right font-semibold text-foreground">Вес, кг</TableHead>
                <TableHead className="text-right font-semibold text-foreground">Объём, м³</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={12} className="py-6">
                    <LoadingFallback onRefresh={() => refetch()} />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="py-12 text-center">
                    <ClipboardList className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                    <div className="text-sm text-muted-foreground">Заявки не найдены</div>
                    <button
                      type="button"
                      onClick={() => refetch()}
                      className="mt-3 inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                    >
                      Обновить
                    </button>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => {
                  const noTime = !r.route_date || !r.departure_time;
                  const rowTone =
                    r.request_priority === "urgent"
                      ? "bg-red-50/60 hover:bg-red-50 dark:bg-red-900/10 dark:hover:bg-red-900/20"
                      : r.request_priority === "high"
                        ? "bg-orange-50/60 hover:bg-orange-50 dark:bg-orange-900/10 dark:hover:bg-orange-900/20"
                        : r.request_priority === "medium"
                          ? "bg-yellow-50/40 hover:bg-yellow-50 dark:bg-yellow-900/10 dark:hover:bg-yellow-900/20"
                          : "";
                  return (
                  <TableRow key={r.id} className={`cursor-pointer ${rowTone}`}>
                    <TableCell>
                      <Link
                        to="/transport-requests/$requestId"
                        params={{ requestId: r.id }}
                        className="font-mono text-sm font-semibold text-primary hover:underline"
                      >
                        {r.route_number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {REQUEST_TYPE_LABELS[r.request_type] ?? r.request_type}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {REQUEST_STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <RequestWarehouseStatusBadge
                        requestId={r.id}
                        warehouseId={r.warehouse_id}
                      />
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.warehouses?.name ?? (
                        r.request_type === "factory_to_warehouse" ? (
                          <span className="text-muted-foreground">Завод</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.destination?.name ?? (
                        r.request_type === "client_delivery" ? (
                          <span className="text-muted-foreground">Клиенты</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.route_date ? (
                        new Date(r.route_date).toLocaleDateString("ru-RU")
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.departure_time ? (
                        <span className="font-mono">{r.departure_time.slice(0, 5)}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                          <AlertTriangle className="h-3 w-3" />
                          не указано
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGE_CLASS[r.request_priority]}`}
                      >
                        {PRIORITY_LABELS[r.request_priority]}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-sm">{r.points_count ?? 0}</TableCell>
                    <TableCell className="text-right text-sm">
                      {Number(r.total_weight_kg ?? 0).toLocaleString("ru-RU")}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {Number(r.total_volume_m3 ?? 0).toLocaleString("ru-RU")}
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        {!isLoading && (data?.length ?? 0) >= pageSize && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => setPageSize((n) => n + 50)}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Показать ещё
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="truncate text-foreground">{value}</div>
    </div>
  );
}
