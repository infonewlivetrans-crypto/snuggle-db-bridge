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
import { Search, Route as RouteIcon, AlertTriangle } from "lucide-react";
import {
  DELIVERY_ROUTE_STATUS_LABELS,
  DELIVERY_ROUTE_STATUS_ORDER,
  DELIVERY_ROUTE_STATUS_STYLES,
  type DeliveryRouteStatus,
} from "@/lib/deliveryRoutes";

export const Route = createFileRoute("/delivery-routes/")({
  head: () => ({
    meta: [
      { title: "Маршруты — Радиус Трек" },
      { name: "description", content: "Маршруты доставки на основе заявок" },
    ],
  }),
  component: DeliveryRoutesPage,
});

type Row = {
  id: string;
  route_number: string;
  route_date: string;
  status: DeliveryRouteStatus;
  source_request_id: string;
  source_warehouse_id: string | null;
  assigned_driver: string | null;
  assigned_vehicle: string | null;
  source_request: { route_number: string } | null;
  source_warehouse: { name: string; city: string | null } | null;
};

function DeliveryRoutesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<DeliveryRouteStatus | "all">("all");

  const { data, isLoading } = useQuery({
    queryKey: ["delivery-routes"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("delivery_routes")
        .select(
          "id, route_number, route_date, status, source_request_id, source_warehouse_id, assigned_driver, assigned_vehicle, source_request:source_request_id(route_number), source_warehouse:source_warehouse_id(name, city)",
        )
        .order("route_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.route_number.toLowerCase().includes(q) ||
        (r.source_request?.route_number ?? "").toLowerCase().includes(q) ||
        (r.source_warehouse?.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [data, search, statusFilter]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
              <RouteIcon className="h-6 w-6 text-muted-foreground" />
              Маршруты
            </h1>
            <p className="text-sm text-muted-foreground">
              Маршруты доставки, созданные на основе заявок на транспорт
            </p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по номеру, заявке, складу..."
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as DeliveryRouteStatus | "all")}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              {DELIVERY_ROUTE_STATUS_ORDER.map((s) => (
                <SelectItem key={s} value={s}>{DELIVERY_ROUTE_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Номер</TableHead>
                <TableHead>Дата</TableHead>
                <TableHead>Заявка</TableHead>
                <TableHead>Склад отправления</TableHead>
                <TableHead>Водитель</TableHead>
                <TableHead>Машина</TableHead>
                <TableHead>Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Загрузка...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Маршрутов нет. Создайте маршрут из карточки заявки.</TableCell></TableRow>
              ) : (
                filtered.map((r) => {
                  const missing = !r.assigned_driver || !r.assigned_vehicle;
                  return (
                    <TableRow key={r.id} className="cursor-pointer">
                      <TableCell>
                        <Link
                          to="/delivery-routes/$deliveryRouteId"
                          params={{ deliveryRouteId: r.id }}
                          className="font-medium text-foreground hover:underline"
                        >
                          {r.route_number}
                        </Link>
                        {missing && (
                          <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300">
                            <AlertTriangle className="h-3 w-3" />
                            Не назначен водитель или транспорт
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{new Date(r.route_date).toLocaleDateString("ru-RU")}</TableCell>
                      <TableCell>
                        {r.source_request ? (
                          <Link
                            to="/transport-requests/$requestId"
                            params={{ requestId: r.source_request_id }}
                            className="text-sm text-primary hover:underline"
                          >
                            {r.source_request.route_number}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.source_warehouse ? (
                          <span>{r.source_warehouse.name}{r.source_warehouse.city ? `, ${r.source_warehouse.city}` : ""}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.assigned_driver ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        {r.assigned_vehicle ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={DELIVERY_ROUTE_STATUS_STYLES[r.status]}>
                          {DELIVERY_ROUTE_STATUS_LABELS[r.status]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </main>
    </div>
  );
}
