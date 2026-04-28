import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
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
import { Search, ClipboardList } from "lucide-react";

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
  route_date: string;
  warehouse_id: string | null;
  destination_warehouse_id: string | null;
  points_count: number;
  total_weight_kg: number;
  total_volume_m3: number;
  warehouses?: { name: string } | null;
  destination?: { name: string } | null;
};

function TransportRequestsPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["transport-requests"],
    queryFn: async (): Promise<RequestRow[]> => {
      const { data, error } = await supabase
        .from("routes")
        .select(
          "id, route_number, request_type, status, route_date, warehouse_id, destination_warehouse_id, points_count, total_weight_kg, total_volume_m3, warehouses:warehouse_id(name), destination:destination_warehouse_id(name)",
        )
        .order("route_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RequestRow[];
    },
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

        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                <TableHead className="font-semibold text-foreground">Номер</TableHead>
                <TableHead className="font-semibold text-foreground">Тип</TableHead>
                <TableHead className="font-semibold text-foreground">Статус</TableHead>
                <TableHead className="font-semibold text-foreground">Склад отправления</TableHead>
                <TableHead className="font-semibold text-foreground">Склад назначения</TableHead>
                <TableHead className="font-semibold text-foreground">Дата</TableHead>
                <TableHead className="text-right font-semibold text-foreground">Заказов</TableHead>
                <TableHead className="text-right font-semibold text-foreground">Вес, кг</TableHead>
                <TableHead className="text-right font-semibold text-foreground">Объём, м³</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                    Загрузка...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center">
                    <ClipboardList className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                    <div className="text-sm text-muted-foreground">Заявки не найдены</div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer">
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
                      {new Date(r.route_date).toLocaleDateString("ru-RU")}
                    </TableCell>
                    <TableCell className="text-right text-sm">{r.points_count ?? 0}</TableCell>
                    <TableCell className="text-right text-sm">
                      {Number(r.total_weight_kg ?? 0).toLocaleString("ru-RU")}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {Number(r.total_volume_m3 ?? 0).toLocaleString("ru-RU")}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </main>
    </div>
  );
}
