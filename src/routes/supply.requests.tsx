import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PackageSearch,
  Plus,
  Factory,
  Warehouse as WarehouseIcon,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  FileEdit,
  Truck,
  PackageCheck,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { notifySupplyRequestCreated } from "@/lib/supplyNotifications";

export const Route = createFileRoute("/supply/requests")({
  head: () => ({
    meta: [
      { title: "Заявки на пополнение — Радиус Трек" },
      { name: "description", content: "Заявки на завод и перемещения между складами" },
    ],
  }),
  component: SupplyRequestsPage,
});

type SourceType = "factory" | "warehouse";
type Priority = "low" | "normal" | "high" | "urgent";
type Status = "draft" | "pending" | "confirmed" | "in_transit" | "received" | "cancelled";

type SupplyRequest = {
  id: string;
  request_number: string;
  source_type: SourceType;
  source_warehouse_id: string | null;
  source_name: string | null;
  destination_warehouse_id: string;
  product_id: string;
  qty: number;
  priority: Priority;
  status: Status;
  expected_at: string | null;
  comment: string | null;
  created_by: string | null;
  created_at: string;
};

type Warehouse = { id: string; name: string };
type Product = { id: string; name: string; sku: string | null; unit: string | null };

const STATUS_LABELS: Record<Status, string> = {
  draft: "Черновик",
  pending: "В ожидании",
  confirmed: "Подтверждено",
  in_transit: "В пути",
  received: "Принято",
  cancelled: "Отменено",
};

const STATUS_STYLES: Record<Status, string> = {
  draft: "border-slate-300 bg-slate-100 text-slate-800",
  pending: "border-amber-300 bg-amber-100 text-amber-900",
  confirmed: "border-blue-300 bg-blue-100 text-blue-900",
  in_transit: "border-indigo-300 bg-indigo-100 text-indigo-900",
  received: "border-green-300 bg-green-100 text-green-900",
  cancelled: "border-red-300 bg-red-100 text-red-900",
};

const STATUS_ICONS: Record<Status, typeof Clock> = {
  draft: FileEdit,
  pending: Clock,
  confirmed: CheckCircle2,
  in_transit: Truck,
  received: PackageCheck,
  cancelled: XCircle,
};

const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Низкий",
  normal: "Обычный",
  high: "Высокий",
  urgent: "Срочный",
};

const PRIORITY_STYLES: Record<Priority, string> = {
  low: "border-slate-300 bg-slate-50 text-slate-700",
  normal: "border-slate-300 bg-white text-slate-800",
  high: "border-orange-300 bg-orange-50 text-orange-800",
  urgent: "border-red-300 bg-red-50 text-red-800 font-semibold",
};

function SupplyRequestsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: requests, isLoading } = useQuery({
    queryKey: ["supply-requests"],
    queryFn: async (): Promise<SupplyRequest[]> => {
      const { data, error } = await db
        .from("supply_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SupplyRequest[];
    },
  });

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses-min"],
    queryFn: async (): Promise<Warehouse[]> => {
      const { data, error } = await db.from("warehouses").select("id, name").eq("is_active", true).order("name");
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

  const filtered = useMemo(() => {
    return (requests ?? []).filter((r) =>
      statusFilter === "all" ? true : r.status === statusFilter
    );
  }, [requests, statusFilter]);

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

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
              <PackageSearch className="h-6 w-6 text-primary" />
              Заявки на пополнение
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Заявки на завод и перемещения между складами
            </p>
          </div>
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Новая заявка
          </Button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Статус" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>№</TableHead>
                <TableHead>Источник</TableHead>
                <TableHead>Получатель</TableHead>
                <TableHead>Товар</TableHead>
                <TableHead className="text-right">Кол-во</TableHead>
                <TableHead>Приоритет</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    Загрузка…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    Заявок пока нет
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => {
                  const product = productById.get(r.product_id);
                  const StatusIcon = STATUS_ICONS[r.status];
                  return (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-secondary/40"
                      onClick={() => setSelectedId(r.id)}
                    >
                      <TableCell className="font-mono text-xs">{r.request_number}</TableCell>
                      <TableCell className="text-sm">
                        {r.source_type === "factory" ? (
                          <span className="inline-flex items-center gap-1">
                            <Factory className="h-3.5 w-3.5 text-muted-foreground" />
                            {r.source_name ?? "Завод"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <WarehouseIcon className="h-3.5 w-3.5 text-muted-foreground" />
                            {r.source_warehouse_id
                              ? warehouseById.get(r.source_warehouse_id) ?? "—"
                              : r.source_name ?? "—"}
                          </span>
                        )}
                      </TableCell>
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
                        {Number(r.qty).toLocaleString("ru-RU")} {product?.unit ?? ""}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={PRIORITY_STYLES[r.priority]}>
                          {PRIORITY_LABELS[r.priority]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_STYLES[r.status]}>
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {STATUS_LABELS[r.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <StatusActions request={r} />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </main>

      <CreateRequestWizard
        open={open}
        onOpenChange={setOpen}
        warehouses={warehouses ?? []}
        products={products ?? []}
      />
      <RequestDetailsDialog
        requestId={selectedId}
        onOpenChange={(v) => !v && setSelectedId(null)}
        warehouseById={warehouseById}
        productById={productById}
      />
    </div>
  );
}

// -------- Status actions --------

const NEXT_STATUS: Partial<Record<Status, { to: Status; label: string }[]>> = {
  draft: [
    { to: "pending", label: "Отправить" },
    { to: "cancelled", label: "Отменить" },
  ],
  pending: [
    { to: "confirmed", label: "Подтвердить" },
    { to: "cancelled", label: "Отменить" },
  ],
  confirmed: [
    { to: "in_transit", label: "В пути" },
    { to: "received", label: "Принять" },
    { to: "cancelled", label: "Отменить" },
  ],
  in_transit: [
    { to: "received", label: "Принять" },
    { to: "cancelled", label: "Отменить" },
  ],
};

function StatusActions({ request }: { request: SupplyRequest }) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (newStatus: Status) => {
      const { error } = await db
        .from("supply_requests")
        .update({ status: newStatus })
        .eq("id", request.id);
      if (error) throw error;
    },
    onSuccess: (_d, newStatus) => {
      toast.success(`Статус: ${STATUS_LABELS[newStatus]}`);
      qc.invalidateQueries({ queryKey: ["supply-requests"] });
      qc.invalidateQueries({ queryKey: ["stock-balances"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const next = NEXT_STATUS[request.status];
  if (!next || next.length === 0) return <span className="text-xs text-muted-foreground">—</span>;

  return (
    <div className="flex flex-wrap justify-end gap-1">
      {next.map((n) => (
        <Button
          key={n.to}
          size="sm"
          variant={n.to === "cancelled" ? "ghost" : "outline"}
          disabled={mutation.isPending}
          onClick={() => mutation.mutate(n.to)}
        >
          {n.label}
        </Button>
      ))}
    </div>
  );
}

// -------- Wizard --------

const wizardSchema = z.object({
  source_type: z.enum(["factory", "warehouse"]),
  source_warehouse_id: z.string().uuid().nullable(),
  source_name: z.string().trim().max(200).nullable(),
  destination_warehouse_id: z.string().uuid({ message: "Выберите склад-получатель" }),
  product_id: z.string().uuid({ message: "Выберите товар" }),
  qty: z.number().positive({ message: "Количество должно быть больше 0" }),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  status: z.enum(["draft", "pending"]),
  expected_at: z.string().nullable(),
  comment: z.string().trim().max(1000).nullable(),
});

function CreateRequestWizard({
  open,
  onOpenChange,
  warehouses,
  products,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  warehouses: Warehouse[];
  products: Product[];
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [sourceType, setSourceType] = useState<SourceType>("factory");
  const [sourceWarehouseId, setSourceWarehouseId] = useState<string>("");
  const [sourceName, setSourceName] = useState<string>("");
  const [destWarehouseId, setDestWarehouseId] = useState<string>("");
  const [productId, setProductId] = useState<string>("");
  const [qty, setQty] = useState<string>("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [status, setStatus] = useState<"draft" | "pending">("draft");
  const [expectedAt, setExpectedAt] = useState<string>("");
  const [comment, setComment] = useState<string>("");

  const reset = () => {
    setStep(1);
    setSourceType("factory");
    setSourceWarehouseId("");
    setSourceName("");
    setDestWarehouseId("");
    setProductId("");
    setQty("");
    setPriority("normal");
    setStatus("draft");
    setExpectedAt("");
    setComment("");
  };

  const handleClose = (v: boolean) => {
    onOpenChange(v);
    if (!v) setTimeout(reset, 200);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const parsed = wizardSchema.safeParse({
        source_type: sourceType,
        source_warehouse_id: sourceType === "warehouse" ? sourceWarehouseId || null : null,
        source_name: sourceType === "factory" ? (sourceName.trim() || null) : null,
        destination_warehouse_id: destWarehouseId,
        product_id: productId,
        qty: Number(qty),
        priority,
        status,
        expected_at: expectedAt || null,
        comment: comment.trim() || null,
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "Проверьте поля");
      }
      if (sourceType === "warehouse" && !sourceWarehouseId) {
        throw new Error("Выберите склад-источник");
      }
      if (sourceType === "warehouse" && sourceWarehouseId === destWarehouseId) {
        throw new Error("Источник и получатель должны отличаться");
      }
      const payload = {
        ...parsed.data,
        expected_at: parsed.data.expected_at
          ? new Date(parsed.data.expected_at).toISOString()
          : null,
      };
      const { data: inserted, error } = await db
        .from("supply_requests")
        .insert(payload)
        .select("id, request_number")
        .single();
      if (error) throw error;
      // Уведомление снабжению о созданной заявке
      const whName = warehouses.find((w) => w.id === destWarehouseId)?.name ?? null;
      const product = products.find((p) => p.id === productId);
      await notifySupplyRequestCreated({
        supplyRequestId: (inserted as { id: string }).id,
        requestNumber: (inserted as { request_number: string }).request_number,
        warehouseId: destWarehouseId,
        warehouseName: whName,
        productId: productId,
        productName: product?.name ?? null,
        qty: Number(qty),
        unit: product?.unit ?? null,
      });
    },
    onSuccess: () => {
      toast.success("Заявка создана");
      qc.invalidateQueries({ queryKey: ["supply-requests"] });
      handleClose(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canStep2 =
    (sourceType === "factory" || (sourceType === "warehouse" && !!sourceWarehouseId)) &&
    !!destWarehouseId &&
    (sourceType === "factory" ? sourceWarehouseId !== destWarehouseId : true);
  const canStep3 = !!productId && Number(qty) > 0;

  const selectedProduct = products.find((p) => p.id === productId);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Новая заявка на пополнение — шаг {step} из 3</DialogTitle>
          <DialogDescription>
            {step === 1 && "Выберите источник поставки и склад-получатель"}
            {step === 2 && "Укажите товар и количество"}
            {step === 3 && "Установите приоритет, ожидаемую дату и статус"}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Тип источника</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSourceType("factory")}
                  className={`flex items-center gap-2 rounded-md border p-3 text-sm transition-colors ${
                    sourceType === "factory"
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border hover:bg-secondary"
                  }`}
                >
                  <Factory className="h-4 w-4" />
                  Завод / поставщик
                </button>
                <button
                  type="button"
                  onClick={() => setSourceType("warehouse")}
                  className={`flex items-center gap-2 rounded-md border p-3 text-sm transition-colors ${
                    sourceType === "warehouse"
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border hover:bg-secondary"
                  }`}
                >
                  <WarehouseIcon className="h-4 w-4" />
                  Перемещение со склада
                </button>
              </div>
            </div>

            {sourceType === "factory" ? (
              <div>
                <Label htmlFor="src-name">Название завода / поставщика</Label>
                <Input
                  id="src-name"
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  placeholder="Напр., Завод «Стройпром»"
                  maxLength={200}
                />
              </div>
            ) : (
              <div>
                <Label>Склад-источник</Label>
                <Select value={sourceWarehouseId} onValueChange={setSourceWarehouseId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите склад-источник" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Склад-получатель *</Label>
              <Select value={destWarehouseId} onValueChange={setDestWarehouseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Куда поступит товар" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses
                    .filter((w) => sourceType === "factory" || w.id !== sourceWarehouseId)
                    .map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <Label>Товар *</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите товар" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.sku ? ` · ${p.sku}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="qty">Количество * {selectedProduct?.unit ? `(${selectedProduct.unit})` : ""}</Label>
              <Input
                id="qty"
                type="number"
                min="0"
                step="0.001"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div>
              <Label>Приоритет</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="exp">Ожидаемая дата поступления</Label>
              <Input
                id="exp"
                type="datetime-local"
                value={expectedAt}
                onChange={(e) => setExpectedAt(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="cmt">Комментарий</Label>
              <Textarea
                id="cmt"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Доп. информация о заявке"
              />
            </div>
            <div>
              <Label>Сохранить как</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStatus("draft")}
                  className={`rounded-md border p-3 text-sm transition-colors ${
                    status === "draft"
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border hover:bg-secondary"
                  }`}
                >
                  <FileEdit className="mx-auto mb-1 h-4 w-4" />
                  Черновик
                </button>
                <button
                  type="button"
                  onClick={() => setStatus("pending")}
                  className={`rounded-md border p-3 text-sm transition-colors ${
                    status === "pending"
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border hover:bg-secondary"
                  }`}
                >
                  <Clock className="mx-auto mb-1 h-4 w-4" />
                  Отправить (в ожидании)
                </button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex justify-between sm:justify-between">
          <Button
            variant="ghost"
            disabled={step === 1 || createMutation.isPending}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Назад
          </Button>
          {step < 3 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={(step === 1 && !canStep2) || (step === 2 && !canStep3)}
            >
              Далее
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Сохранение…" : "Создать заявку"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------- Details + history --------

type StatusHistoryRow = {
  id: string;
  supply_request_id: string;
  from_status: Status | null;
  to_status: Status;
  changed_at: string;
  changed_by: string | null;
  comment: string | null;
  in_transit_snapshot: {
    id?: string;
    qty?: number;
    product_id?: string;
    destination_warehouse_id?: string;
    created_at?: string;
  } | null;
};

function RequestDetailsDialog({
  requestId,
  onOpenChange,
  warehouseById,
  productById,
}: {
  requestId: string | null;
  onOpenChange: (v: boolean) => void;
  warehouseById: Map<string, string>;
  productById: Map<string, Product>;
}) {
  const open = !!requestId;

  const { data: request } = useQuery({
    queryKey: ["supply-request", requestId],
    enabled: !!requestId,
    queryFn: async (): Promise<SupplyRequest | null> => {
      const { data, error } = await db
        .from("supply_requests")
        .select("*")
        .eq("id", requestId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as SupplyRequest | null;
    },
  });

  const { data: history } = useQuery({
    queryKey: ["supply-request-history", requestId],
    enabled: !!requestId,
    queryFn: async (): Promise<StatusHistoryRow[]> => {
      const { data, error } = await db
        .from("supply_request_status_history")
        .select("*")
        .eq("supply_request_id", requestId)
        .order("changed_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as StatusHistoryRow[];
    },
  });

  const product = request ? productById.get(request.product_id) : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Заявка {request?.request_number ?? ""}</DialogTitle>
          <DialogDescription>
            {product?.name ?? "Товар"} ·{" "}
            {request ? Number(request.qty).toLocaleString("ru-RU") : ""} {product?.unit ?? ""} ·
            получатель: {request ? warehouseById.get(request.destination_warehouse_id) ?? "—" : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {request && (
            <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-secondary/30 p-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Статус</div>
                <Badge variant="outline" className={STATUS_STYLES[request.status]}>
                  {STATUS_LABELS[request.status]}
                </Badge>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Приоритет</div>
                <Badge variant="outline" className={PRIORITY_STYLES[request.priority]}>
                  {PRIORITY_LABELS[request.priority]}
                </Badge>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Источник</div>
                <div>
                  {request.source_type === "factory"
                    ? request.source_name ?? "Завод"
                    : request.source_warehouse_id
                      ? warehouseById.get(request.source_warehouse_id) ?? "—"
                      : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Ожидаемая дата</div>
                <div>
                  {request.expected_at
                    ? new Date(request.expected_at).toLocaleString("ru-RU")
                    : "—"}
                </div>
              </div>
            </div>
          )}

          <div>
            <div className="mb-2 text-sm font-semibold text-foreground">История статусов</div>
            {!history || history.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                Изменений пока нет
              </div>
            ) : (
              <ol className="relative space-y-3 border-l border-border pl-4">
                {history.map((h) => {
                  const isCancel = h.to_status === "cancelled";
                  const Icon = STATUS_ICONS[h.to_status];
                  return (
                    <li key={h.id} className="relative">
                      <span
                        className={`absolute -left-[21px] top-1 inline-flex h-3 w-3 items-center justify-center rounded-full border-2 border-background ${
                          isCancel ? "bg-red-500" : "bg-primary"
                        }`}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={STATUS_STYLES[h.to_status]}>
                          <Icon className="mr-1 h-3 w-3" />
                          {STATUS_LABELS[h.to_status]}
                        </Badge>
                        {h.from_status && (
                          <span className="text-xs text-muted-foreground">
                            из «{STATUS_LABELS[h.from_status]}»
                          </span>
                        )}
                        <span className="ml-auto text-xs text-muted-foreground">
                          {new Date(h.changed_at).toLocaleString("ru-RU")}
                        </span>
                      </div>
                      {h.changed_by && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          Автор: {h.changed_by}
                        </div>
                      )}
                      {h.comment && (
                        <div className="mt-0.5 text-xs text-muted-foreground">{h.comment}</div>
                      )}
                      {isCancel && (
                        <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-900">
                          <div className="font-semibold">Заявка отменена</div>
                          {h.in_transit_snapshot ? (
                            <div className="mt-1 space-y-0.5">
                              <div>
                                Удалена запись «в пути»:{" "}
                                <span className="font-mono">
                                  {h.in_transit_snapshot.id?.slice(0, 8) ?? "—"}…
                                </span>
                              </div>
                              <div>
                                Объём в пути на момент отмены:{" "}
                                {h.in_transit_snapshot.qty != null
                                  ? Number(h.in_transit_snapshot.qty).toLocaleString("ru-RU")
                                  : "—"}{" "}
                                {product?.unit ?? ""}
                              </div>
                              {h.in_transit_snapshot.created_at && (
                                <div>
                                  Создана:{" "}
                                  {new Date(h.in_transit_snapshot.created_at).toLocaleString("ru-RU")}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="mt-1">Связанной поставки в пути не было.</div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
