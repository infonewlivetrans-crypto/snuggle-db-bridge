import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PackageSearch,
  ChevronLeft,
  AlertTriangle,
  ClipboardList,
  ArrowLeftRight,
  Truck,
  MessageSquare,
  Bell,
  CheckCheck,
  Circle,
  PackageCheck,
} from "lucide-react";
import { toast } from "sonner";
import { notifyLowStock } from "@/lib/supplyNotifications";

export const Route = createFileRoute("/supply/cabinet")({
  head: () => ({
    meta: [
      { title: "Кабинет снабжения — Радиус Трек" },
      { name: "description", content: "Дефицит, заявки на пополнение, перемещения и товары в пути" },
    ],
  }),
  component: SupplyCabinetPage,
});

// ----- Types -----
type StockBalance = {
  product_id: string;
  sku: string | null;
  product_name: string;
  unit: string | null;
  warehouse_id: string | null;
  warehouse_name: string | null;
  on_hand: number;
  reserved: number;
  available: number;
  in_transit: number;
  min_stock: number;
  is_critical: boolean;
  deficit_level: "ok" | "low" | "critical" | "out";
};

type SupplyStatus = "created" | "in_progress" | "ordered" | "awaiting" | "received" | "closed";

type SupplySourceType = "factory" | "warehouse" | "supplier";

type SupplyRequest = {
  id: string;
  request_number: string;
  source_type: SupplySourceType;
  source_warehouse_id: string | null;
  source_name: string | null;
  destination_warehouse_id: string;
  product_id: string;
  qty: number;
  status: string;
  comment: string | null;
  supply_status: SupplyStatus;
  supply_comment: string | null;
  supply_status_changed_at: string | null;
  supply_status_changed_by: string | null;
  expected_at: string | null;
  expected_time: string | null;
  planned_vehicle: string | null;
  planned_carrier: string | null;
  inbound_shipment_id: string | null;
  created_at: string;
};

type StockTransfer = {
  id: string;
  transfer_number: string;
  source_warehouse_id: string;
  destination_warehouse_id: string;
  product_id: string;
  qty: number;
  status: string;
  sent_at: string | null;
  arrived_at: string | null;
  accepted_at: string | null;
  comment: string | null;
};

type InTransit = {
  id: string;
  product_id: string;
  destination_warehouse_id: string;
  source_type: string;
  source_warehouse_id: string | null;
  source_name: string | null;
  qty: number;
  status: string;
  expected_at: string | null;
};

type Warehouse = { id: string; name: string };
type Product = { id: string; name: string; sku: string | null; unit: string | null };

type SupplyNotification = {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
  is_read: boolean;
  read_at: string | null;
  route_id: string | null;
  payload: {
    reason?: string;
    warehouse_id?: string | null;
    warehouse_name?: string | null;
    product_id?: string | null;
    product_name?: string | null;
    transport_request_id?: string | null;
    route_number?: string | null;
    request_number?: string | null;
    available?: number;
    min_stock?: number;
    deficit?: number;
    qty?: number;
  } | null;
};

const SUPPLY_STATUS_LABELS: Record<SupplyStatus, string> = {
  created: "Заявка создана",
  in_progress: "В работе",
  ordered: "Заказано",
  awaiting: "Ожидается поставка",
  received: "Поступило на склад",
  closed: "Закрыта",
};

const SUPPLY_STATUS_STYLES: Record<SupplyStatus, string> = {
  created: "border-slate-300 bg-slate-100 text-slate-800",
  in_progress: "border-blue-300 bg-blue-100 text-blue-900",
  ordered: "border-indigo-300 bg-indigo-100 text-indigo-900",
  awaiting: "border-amber-300 bg-amber-100 text-amber-900",
  received: "border-emerald-300 bg-emerald-100 text-emerald-900",
  closed: "border-green-300 bg-green-100 text-green-900",
};

const TRANSFER_STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  sent: "Отправлено",
  in_transit: "В пути",
  arrived: "Прибыло",
  accepted: "Принято",
  cancelled: "Отменено",
};

function fmt(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("ru-RU");
}

function SupplyCabinetPage() {
  const { data: balances } = useQuery({
    queryKey: ["stock-balances"],
    queryFn: async (): Promise<StockBalance[]> => {
      const { data, error } = await db.from("stock_balances").select("*");
      if (error) throw error;
      return (data ?? []) as StockBalance[];
    },
  });

  const { data: requests } = useQuery({
    queryKey: ["supply-requests-cabinet"],
    queryFn: async (): Promise<SupplyRequest[]> => {
      const { data, error } = await db
        .from("supply_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SupplyRequest[];
    },
  });

  const { data: transfers } = useQuery({
    queryKey: ["stock-transfers-cabinet"],
    queryFn: async (): Promise<StockTransfer[]> => {
      const { data, error } = await db
        .from("stock_transfers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StockTransfer[];
    },
  });

  const { data: inTransit } = useQuery({
    queryKey: ["supply-in-transit-cabinet"],
    queryFn: async (): Promise<InTransit[]> => {
      const { data, error } = await db
        .from("supply_in_transit")
        .select("*")
        .in("status", ["planned", "in_transit"])
        .order("expected_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as InTransit[];
    },
  });

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses-min"],
    queryFn: async (): Promise<Warehouse[]> => {
      const { data, error } = await db.from("warehouses").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as Warehouse[];
    },
  });

  const { data: products } = useQuery({
    queryKey: ["products-min"],
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await db
        .from("products")
        .select("id, name, sku, unit")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });

  const warehouseById = useMemo(() => {
    const m = new Map<string, string>();
    (warehouses ?? []).forEach((w) => m.set(w.id, w.name));
    return m;
  }, [warehouses]);

  const productById = useMemo(() => {
    const m = new Map<string, Product>();
    (products ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [products]);

  const deficitItems = useMemo(
    () =>
      (balances ?? [])
        .filter((b) => b.deficit_level !== "ok")
        .sort((a, b) => {
          const order = { out: 0, critical: 1, low: 2, ok: 3 } as const;
          return order[a.deficit_level] - order[b.deficit_level];
        }),
    [balances]
  );

  // Уведомление снабжению о низком остатке (с дедупликацией на стороне БД)
  useEffect(() => {
    if (!balances) return;
    const lowStock = balances.filter(
      (b) =>
        b.warehouse_id &&
        b.product_id &&
        Number(b.min_stock ?? 0) > 0 &&
        Number(b.available ?? 0) < Number(b.min_stock ?? 0),
    );
    if (lowStock.length === 0) return;
    (async () => {
      for (const b of lowStock) {
        await notifyLowStock({
          warehouseId: b.warehouse_id as string,
          warehouseName: b.warehouse_name ?? "—",
          productId: b.product_id,
          productName: b.product_name,
          available: Number(b.available ?? 0),
          minStock: Number(b.min_stock ?? 0),
          unit: b.unit,
        });
      }
    })();
  }, [balances]);

  // Уведомления снабжению
  const { data: notifications } = useQuery({
    queryKey: ["supply-notifications"],
    queryFn: async (): Promise<SupplyNotification[]> => {
      const { data, error } = await db
        .from("notifications")
        .select("*")
        .eq("kind", "supply_alert")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as SupplyNotification[];
    },
  });

  const unreadCount = (notifications ?? []).filter((n) => !n.is_read).length;

  const counts = {
    deficit: deficitItems.length,
    requests: (requests ?? []).filter((r) => r.supply_status !== "closed").length,
    transfers: (transfers ?? []).filter((t) => !["accepted", "cancelled"].includes(t.status)).length,
    inTransit: (inTransit ?? []).length,
    notifications: unreadCount,
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/supply" className="inline-flex items-center hover:text-foreground">
            <ChevronLeft className="h-4 w-4" />
            Снабжение
          </Link>
        </div>

        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <PackageSearch className="h-6 w-6 text-primary" />
            Кабинет снабжения
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Контроль дефицита, заявки на пополнение, перемещения и товары в пути
          </p>
        </div>

        {/* Сводка */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <SummaryCard icon={AlertTriangle} label="Дефицит" value={counts.deficit} accent="text-red-700" />
          <SummaryCard icon={ClipboardList} label="Заявки в работе" value={counts.requests} accent="text-blue-700" />
          <SummaryCard icon={ArrowLeftRight} label="Перемещения" value={counts.transfers} accent="text-indigo-700" />
          <SummaryCard icon={Truck} label="В пути" value={counts.inTransit} accent="text-amber-700" />
          <SummaryCard icon={Bell} label="Новые уведомления" value={counts.notifications} accent="text-rose-700" />
        </div>

        <Tabs defaultValue="deficit" className="w-full">
          <TabsList className="mb-4 flex flex-wrap">
            <TabsTrigger value="deficit">
              <AlertTriangle className="mr-2 h-4 w-4" />
              Дефицит ({counts.deficit})
            </TabsTrigger>
            <TabsTrigger value="requests">
              <ClipboardList className="mr-2 h-4 w-4" />
              Заявки на пополнение
            </TabsTrigger>
            <TabsTrigger value="transfers">
              <ArrowLeftRight className="mr-2 h-4 w-4" />
              Перемещения
            </TabsTrigger>
            <TabsTrigger value="transit">
              <Truck className="mr-2 h-4 w-4" />
              Товары в пути
            </TabsTrigger>
            <TabsTrigger value="notifications">
              <Bell className="mr-2 h-4 w-4" />
              Уведомления{unreadCount > 0 ? ` (${unreadCount})` : ""}
            </TabsTrigger>
          </TabsList>

          {/* Дефицит */}
          <TabsContent value="deficit">
            <DeficitTable items={deficitItems} />
          </TabsContent>

          {/* Заявки */}
          <TabsContent value="requests">
            <RequestsTable
              requests={requests ?? []}
              warehouseById={warehouseById}
              productById={productById}
            />
          </TabsContent>

          {/* Перемещения */}
          <TabsContent value="transfers">
            <TransfersTable
              transfers={transfers ?? []}
              warehouseById={warehouseById}
              productById={productById}
            />
          </TabsContent>

          {/* В пути */}
          <TabsContent value="transit">
            <InTransitTable
              items={inTransit ?? []}
              warehouseById={warehouseById}
              productById={productById}
            />
          </TabsContent>

          {/* Уведомления */}
          <TabsContent value="notifications">
            <NotificationsTable items={notifications ?? []} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof AlertTriangle;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${accent}`} />
      </div>
      <div className={`mt-2 text-2xl font-semibold ${accent}`}>{value}</div>
    </div>
  );
}

// ===== Дефицит =====
function DeficitTable({ items }: { items: StockBalance[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Дефицита нет — все позиции в норме
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Склад</TableHead>
            <TableHead>Товар</TableHead>
            <TableHead className="text-right">Доступно</TableHead>
            <TableHead className="text-right">Мин. остаток</TableHead>
            <TableHead className="text-right">Не хватает</TableHead>
            <TableHead>Причина</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((b) => {
            const deficit = Math.max(0, Number(b.min_stock ?? 0) - Number(b.available ?? 0));
            const reason =
              b.deficit_level === "out"
                ? "Нет в наличии"
                : b.deficit_level === "critical"
                ? "Ниже критического уровня"
                : "Ниже минимального остатка";
            return (
              <TableRow key={`${b.product_id}-${b.warehouse_id ?? "none"}`}>
                <TableCell className="text-sm">{b.warehouse_name ?? "—"}</TableCell>
                <TableCell>
                  <div className="font-medium text-foreground">{b.product_name}</div>
                  {b.sku && (
                    <div className="font-mono text-xs text-muted-foreground">{b.sku}</div>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {fmt(b.available)} {b.unit ?? ""}
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-muted-foreground">
                  {fmt(b.min_stock)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm font-semibold text-red-700">
                  {fmt(deficit)}
                </TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground">{reason}</span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ===== Заявки =====
function RequestsTable({
  requests,
  warehouseById,
  productById,
}: {
  requests: SupplyRequest[];
  warehouseById: Map<string, string>;
  productById: Map<string, Product>;
}) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editing, setEditing] = useState<SupplyRequest | null>(null);

  const filtered = useMemo(
    () =>
      requests.filter((r) =>
        statusFilter === "all" ? true : (r.supply_status ?? "created") === statusFilter
      ),
    [requests, statusFilter]
  );

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Статус снабжения" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            {(Object.keys(SUPPLY_STATUS_LABELS) as SupplyStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {SUPPLY_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>№ заявки</TableHead>
              <TableHead>Склад</TableHead>
              <TableHead>Товар</TableHead>
              <TableHead className="text-right">Кол-во</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Комментарий</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  Заявок нет
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const product = productById.get(r.product_id);
                const supplyStatus = (r.supply_status ?? "created") as SupplyStatus;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.request_number}</TableCell>
                    <TableCell className="text-sm">
                      {warehouseById.get(r.destination_warehouse_id) ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="font-medium">{product?.name ?? "—"}</div>
                      {product?.sku && (
                        <div className="font-mono text-xs text-muted-foreground">{product.sku}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmt(r.qty)} {product?.unit ?? ""}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={SUPPLY_STATUS_STYLES[supplyStatus]}>
                        {SUPPLY_STATUS_LABELS[supplyStatus]}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[260px] text-xs text-muted-foreground">
                      {r.supply_comment ? (
                        <span className="line-clamp-2">{r.supply_comment}</span>
                      ) : r.comment ? (
                        <span className="italic">Заявитель: {r.comment}</span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                        <MessageSquare className="mr-1 h-3.5 w-3.5" />
                        Обработать
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <SupplyEditDialog
        request={editing}
        onClose={() => setEditing(null)}
        productName={editing ? productById.get(editing.product_id)?.name ?? "—" : ""}
        warehouseName={editing ? warehouseById.get(editing.destination_warehouse_id) ?? "—" : ""}
      />
    </>
  );
}

function SupplyEditDialog({
  request,
  onClose,
  productName,
  warehouseName,
}: {
  request: SupplyRequest | null;
  onClose: () => void;
  productName: string;
  warehouseName: string;
}) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<SupplyStatus>("created");
  const [comment, setComment] = useState("");

  // Sync local state when opening
  useMemo(() => {
    if (request) {
      setStatus((request.supply_status ?? "created") as SupplyStatus);
      setComment(request.supply_comment ?? "");
    }
  }, [request]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!request) return;
      const { error } = await db
        .from("supply_requests")
        .update({
          supply_status: status,
          supply_comment: comment.trim() || null,
          supply_status_changed_at: new Date().toISOString(),
        })
        .eq("id", request.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Заявка обновлена");
      qc.invalidateQueries({ queryKey: ["supply-requests-cabinet"] });
      qc.invalidateQueries({ queryKey: ["supply-requests"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!request} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Обработка заявки {request?.request_number}</DialogTitle>
          <DialogDescription>
            {warehouseName} · {productName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Статус снабжения</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as SupplyStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SUPPLY_STATUS_LABELS) as SupplyStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {SUPPLY_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Комментарий снабжения</Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Заказано у поставщика, ожидаем поставку..."
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===== Перемещения =====
function TransfersTable({
  transfers,
  warehouseById,
  productById,
}: {
  transfers: StockTransfer[];
  warehouseById: Map<string, string>;
  productById: Map<string, Product>;
}) {
  if (transfers.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Перемещений между складами нет
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>№</TableHead>
            <TableHead>Откуда</TableHead>
            <TableHead>Куда</TableHead>
            <TableHead>Товар</TableHead>
            <TableHead className="text-right">Кол-во</TableHead>
            <TableHead>Статус</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transfers.map((t) => {
            const product = productById.get(t.product_id);
            return (
              <TableRow key={t.id}>
                <TableCell className="font-mono text-xs">{t.transfer_number}</TableCell>
                <TableCell className="text-sm">
                  {warehouseById.get(t.source_warehouse_id) ?? "—"}
                </TableCell>
                <TableCell className="text-sm">
                  {warehouseById.get(t.destination_warehouse_id) ?? "—"}
                </TableCell>
                <TableCell className="text-sm">
                  <div className="font-medium">{product?.name ?? "—"}</div>
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {fmt(t.qty)} {product?.unit ?? ""}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {TRANSFER_STATUS_LABELS[t.status] ?? t.status}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ===== В пути =====
function InTransitTable({
  items,
  warehouseById,
  productById,
}: {
  items: InTransit[];
  warehouseById: Map<string, string>;
  productById: Map<string, Product>;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Товаров в пути нет
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Источник</TableHead>
            <TableHead>Получатель</TableHead>
            <TableHead>Товар</TableHead>
            <TableHead className="text-right">Кол-во</TableHead>
            <TableHead>Ожидается</TableHead>
            <TableHead>Статус</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((t) => {
            const product = productById.get(t.product_id);
            const source =
              t.source_type === "warehouse" && t.source_warehouse_id
                ? warehouseById.get(t.source_warehouse_id) ?? t.source_name ?? "—"
                : t.source_name ?? (t.source_type === "factory" ? "Завод" : "Поставщик");
            return (
              <TableRow key={t.id}>
                <TableCell className="text-sm">{source}</TableCell>
                <TableCell className="text-sm">
                  {warehouseById.get(t.destination_warehouse_id) ?? "—"}
                </TableCell>
                <TableCell className="text-sm">
                  <div className="font-medium">{product?.name ?? "—"}</div>
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {fmt(t.qty)} {product?.unit ?? ""}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {t.expected_at
                    ? new Date(t.expected_at).toLocaleDateString("ru-RU")
                    : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {t.status === "planned" ? "Запланировано" : "В пути"}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ===== Уведомления =====
const REASON_LABELS: Record<string, string> = {
  low_stock: "Низкий остаток на складе",
  shortage: "Нехватка товара под заявку",
  supply_request_created: "Создана заявка на пополнение",
};

function NotificationsTable({ items }: { items: SupplyNotification[] }) {
  const qc = useQueryClient();

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["supply-notifications"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const { error } = await db
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("kind", "supply_alert")
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Все уведомления прочитаны");
      qc.invalidateQueries({ queryKey: ["supply-notifications"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Уведомлений нет
      </div>
    );
  }

  const hasUnread = items.some((i) => !i.is_read);

  return (
    <>
      {hasUnread && (
        <div className="mb-3 flex justify-end">
          <Button size="sm" variant="outline" onClick={() => markAllRead.mutate()}>
            <CheckCheck className="mr-1 h-3.5 w-3.5" />
            Прочитать все
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">Дата и время</TableHead>
              <TableHead>Склад</TableHead>
              <TableHead>Товар</TableHead>
              <TableHead>Причина</TableHead>
              <TableHead>Заявка на транспорт</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((n) => {
              const p = n.payload ?? {};
              const reasonLabel = p.reason ? REASON_LABELS[p.reason] ?? n.title : n.title;
              const transportLink = p.transport_request_id ? (
                <Link
                  to="/transport-requests/$requestId"
                  params={{ requestId: p.transport_request_id }}
                  className="font-mono text-xs text-blue-700 hover:underline"
                  onClick={() => !n.is_read && markRead.mutate(n.id)}
                >
                  № {p.route_number ?? "—"}
                </Link>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              );
              return (
                <TableRow key={n.id} className={n.is_read ? "" : "bg-rose-50/40"}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(n.created_at).toLocaleString("ru-RU")}
                  </TableCell>
                  <TableCell className="text-sm">{p.warehouse_name ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    <div className="font-medium">{p.product_name ?? "—"}</div>
                    {n.body && (
                      <div className="text-xs text-muted-foreground">{n.body}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{reasonLabel}</TableCell>
                  <TableCell>{transportLink}</TableCell>
                  <TableCell>
                    {n.is_read ? (
                      <Badge variant="outline" className="border-slate-300 bg-slate-100 text-slate-700">
                        <CheckCheck className="mr-1 h-3 w-3" />
                        Прочитано
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-rose-300 bg-rose-100 text-rose-900">
                        <Circle className="mr-1 h-3 w-3 fill-rose-600 text-rose-600" />
                        Новое
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {!n.is_read && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => markRead.mutate(n.id)}
                        disabled={markRead.isPending}
                      >
                        Прочитано
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
