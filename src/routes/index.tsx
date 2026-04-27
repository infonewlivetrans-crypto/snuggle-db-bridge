import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { OrderDetailDialog } from "@/components/OrderDetailDialog";
import { CreateOrderDialog } from "@/components/CreateOrderDialog";
import { ImportOrdersDialog } from "@/components/ImportOrdersDialog";
import { ExportReportButton } from "@/components/ExportReportButton";
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
  type Order,
  type OrderStatus,
  STATUS_LABELS,
  STATUS_ORDER,
  STATUS_STYLES,
  PAYMENT_LABELS,
} from "@/lib/orders";
import { Search, QrCode, RefreshCw, Package2, Plus } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Заказы — Радиус Трек" },
      { name: "description", content: "Управление заказами логистической платформы" },
    ],
  }),
  component: OrdersPage,
});

function OrdersPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const { data: orders, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["orders"],
    queryFn: async (): Promise<Order[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Order[];
    },
  });

  const filtered = useMemo(() => {
    if (!orders) return [];
    return orders.filter((o) => {
      const matchSearch =
        !search ||
        o.order_number.toLowerCase().includes(search.toLowerCase()) ||
        (o.delivery_address?.toLowerCase().includes(search.toLowerCase()) ?? false);
      const matchStatus = statusFilter === "all" || o.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [orders, search, statusFilter]);

  const stats = useMemo(() => {
    if (!orders) return { total: 0, new: 0, inProgress: 0, delivering: 0, completed: 0 };
    return {
      total: orders.length,
      new: orders.filter((o) => o.status === "new").length,
      inProgress: orders.filter((o) => o.status === "in_progress").length,
      delivering: orders.filter((o) => o.status === "delivering").length,
      completed: orders.filter((o) => o.status === "completed").length,
    };
  }, [orders]);

  const openOrder = (order: Order) => {
    setSelectedOrder(order);
    setDialogOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {/* Заголовок */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Заказы
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Управление заказами и статусами доставки
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Обновить</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Импорт (Excel)</span>
              <span className="sm:hidden">Импорт</span>
            </Button>
            <ExportReportButton kind="delivery" label="Отчёт по доставке" />
            <ExportReportButton kind="payments" label="Отчёт по оплатам" />
            <Button size="sm" onClick={() => setCreateOpen(true)} className="ml-auto gap-2 sm:ml-0">
              <Plus className="h-4 w-4" />
              Создать заказ
            </Button>
          </div>
        </div>

        {/* Статистика */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Всего" value={stats.total} accent />
          <StatCard label="Новые" value={stats.new} />
          <StatCard label="В работе" value={stats.inProgress} />
          <StatCard label="Доставка" value={stats.delivering} />
          <StatCard label="Выполнено" value={stats.completed} />
        </div>

        {/* Фильтры */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Поиск по номеру или адресу..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as OrderStatus | "all")}>
            <SelectTrigger className="sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              {STATUS_ORDER.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Таблица */}
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                <TableHead className="font-semibold text-foreground">Номер</TableHead>
                <TableHead className="font-semibold text-foreground">Статус</TableHead>
                <TableHead className="font-semibold text-foreground">Адрес доставки</TableHead>
                <TableHead className="font-semibold text-foreground">Оплата</TableHead>
                <TableHead className="font-semibold text-foreground">QR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                    Загрузка заказов...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center">
                    <Package2 className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                    <div className="text-sm text-muted-foreground">Заказы не найдены</div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((order) => (
                  <TableRow
                    key={order.id}
                    className="cursor-pointer"
                    onClick={() => openOrder(order)}
                  >
                    <TableCell className="font-mono text-sm font-semibold text-foreground">
                      {order.order_number}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_STYLES[order.status]}>
                        {STATUS_LABELS[order.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-md truncate text-sm text-foreground">
                      {order.delivery_address ?? (
                        order.latitude !== null && order.longitude !== null ? (
                          <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
                            <span className="badge-status badge-status-delivering">
                              По координатам
                            </span>
                            {order.latitude.toFixed(5)}, {order.longitude.toFixed(5)}
                          </span>
                        ) : (
                          <span className="italic text-muted-foreground">—</span>
                        )
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-foreground">
                      {PAYMENT_LABELS[order.payment_type]}
                    </TableCell>
                    <TableCell>
                      {order.requires_qr ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-primary/20 px-2 py-1 text-xs font-medium text-foreground">
                          <QrCode className="h-3 w-3" />
                          Требуется
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Нажмите на строку, чтобы открыть карточку заказа
        </p>
      </main>

      <OrderDetailDialog
        order={selectedOrder}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
      <CreateOrderDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ImportOrdersDialog open={importOpen} onOpenChange={setImportOpen} />
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
