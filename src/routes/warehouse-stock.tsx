import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Boxes,
  Search,
  Plus,
  AlertTriangle,
  AlertCircle,
  CircleCheck,
  Truck,
  Pencil,
  History,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/warehouse-stock")({
  head: () => ({
    meta: [
      { title: "Остатки на складе — Радиус Трек" },
      { name: "description", content: "Минимальный учёт остатков на складах" },
    ],
  }),
  component: WarehouseStockPage,
});

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
  safety_stock: number;
  is_critical: boolean;
  deficit_level: "ok" | "low" | "critical" | "out";
};

type Warehouse = { id: string; name: string };
type ProductRow = {
  id: string;
  sku: string | null;
  name: string;
  unit: string | null;
  category: string | null;
  warehouse_id: string | null;
};

type StatusKey = "in_stock" | "low" | "out" | "in_transit_only";

const STATUS_LABEL: Record<StatusKey, string> = {
  in_stock: "В наличии",
  low: "Заканчивается",
  out: "Нет в наличии",
  in_transit_only: "В пути",
};

const STATUS_STYLE: Record<StatusKey, string> = {
  in_stock: "border-green-300 bg-green-100 text-green-900",
  low: "border-amber-300 bg-amber-100 text-amber-900",
  out: "border-red-300 bg-red-100 text-red-900",
  in_transit_only: "border-blue-300 bg-blue-100 text-blue-900",
};

const STATUS_ICON: Record<StatusKey, typeof CircleCheck> = {
  in_stock: CircleCheck,
  low: AlertTriangle,
  out: AlertCircle,
  in_transit_only: Truck,
};

function deriveStatus(b: StockBalance): StatusKey {
  if (b.available <= 0) {
    if (b.in_transit > 0) return "in_transit_only";
    return "out";
  }
  if (b.min_stock > 0 && b.available < b.min_stock) return "low";
  return "in_stock";
}

function fmt(n: number | null | undefined) {
  if (n === null || n === undefined) return "0";
  return Number(n).toLocaleString("ru-RU");
}

function WarehouseStockPage() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [warehouseId, setWarehouseId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editing, setEditing] = useState<StockBalance | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses-min"],
    queryFn: async (): Promise<Warehouse[]> => {
      const { data, error } = await db
        .from("warehouses")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: products } = useQuery({
    queryKey: ["products-with-category"],
    queryFn: async (): Promise<ProductRow[]> => {
      const { data, error } = await db
        .from("products")
        .select("id, sku, name, unit, category, warehouse_id")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProductRow[];
    },
  });

  const { data: balances, isLoading } = useQuery({
    queryKey: ["stock-balances"],
    queryFn: async (): Promise<StockBalance[]> => {
      const { data, error } = await db
        .from("stock_balances")
        .select("*")
        .order("product_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as StockBalance[];
    },
  });

  const categoryByProduct = useMemo(() => {
    const m = new Map<string, string | null>();
    (products ?? []).forEach((p) => m.set(p.id, p.category));
    return m;
  }, [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (balances ?? []).filter((b) => {
      if (warehouseId !== "all" && b.warehouse_id !== warehouseId) return false;
      const st = deriveStatus(b);
      if (statusFilter !== "all" && st !== statusFilter) return false;
      if (!q) return true;
      const cat = categoryByProduct.get(b.product_id) ?? "";
      return (
        b.product_name.toLowerCase().includes(q) ||
        (b.sku ?? "").toLowerCase().includes(q) ||
        (b.warehouse_name ?? "").toLowerCase().includes(q) ||
        cat.toLowerCase().includes(q)
      );
    });
  }, [balances, query, warehouseId, statusFilter, categoryByProduct]);

  const counts = useMemo(() => {
    const c: Record<StatusKey, number> = { in_stock: 0, low: 0, out: 0, in_transit_only: 0 };
    (balances ?? []).forEach((b) => {
      c[deriveStatus(b)] += 1;
    });
    return c;
  }, [balances]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
              <Boxes className="h-6 w-6 text-primary" />
              Остатки на складе
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Минимальный ручной учёт остатков по складам и товарам
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <SummaryBadge status="in_stock" count={counts.in_stock} />
            <SummaryBadge status="low" count={counts.low} />
            <SummaryBadge status="out" count={counts.out} />
            <SummaryBadge status="in_transit_only" count={counts.in_transit_only} />
            <Button size="sm" className="ml-2" onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Добавить товар
            </Button>
          </div>
        </div>

        {/* Фильтры */}
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Поиск по товару, артикулу, категории или складу"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Склад" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все склады</SelectItem>
              {(warehouses ?? []).map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Статус" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              <SelectItem value="in_stock">В наличии</SelectItem>
              <SelectItem value="low">Заканчивается</SelectItem>
              <SelectItem value="out">Нет в наличии</SelectItem>
              <SelectItem value="in_transit_only">В пути</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Таблица */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Склад</TableHead>
                  <TableHead>Товар</TableHead>
                  <TableHead>Категория</TableHead>
                  <TableHead className="text-right">Доступно</TableHead>
                  <TableHead className="text-right">Резерв</TableHead>
                  <TableHead className="text-right">В пути</TableHead>
                  <TableHead className="text-right">Мин. остаток</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                      Загрузка…
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                      Нет данных. Добавьте товар, чтобы начать учёт.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((b) => {
                    const st = deriveStatus(b);
                    const Icon = STATUS_ICON[st];
                    const cat = categoryByProduct.get(b.product_id) ?? "";
                    const isLow = b.min_stock > 0 && b.available < b.min_stock;
                    return (
                      <TableRow key={`${b.product_id}-${b.warehouse_id ?? "none"}`}>
                        <TableCell className="text-sm">
                          {b.warehouse_name ?? <span className="italic text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-foreground">{b.product_name}</div>
                          {b.sku && (
                            <div className="font-mono text-xs text-muted-foreground">{b.sku}</div>
                          )}
                          {isLow && (
                            <div className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                              <AlertTriangle className="h-3 w-3" /> Товар заканчивается
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {cat || <span className="italic">—</span>}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">
                          {fmt(b.available)} {b.unit ?? ""}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">
                          {fmt(b.reserved)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {b.in_transit > 0 ? (
                            <span className="inline-flex items-center gap-1 text-blue-700">
                              <Truck className="h-3 w-3" />
                              {fmt(b.in_transit)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">
                          {fmt(b.min_stock)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_STYLE[st]}>
                            <Icon className="mr-1 h-3 w-3" />
                            {STATUS_LABEL[st]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditing(b)}
                              aria-label="Редактировать"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              asChild
                              variant="ghost"
                              size="icon"
                              aria-label="История движения"
                            >
                              <Link
                                to="/warehouse-movements"
                                search={{ productId: b.product_id }}
                              >
                                <History className="h-4 w-4" />
                              </Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>

      {editing && (
        <EditStockDialog
          balance={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["stock-balances"] });
          }}
        />
      )}

      {creating && (
        <CreateProductDialog
          warehouses={warehouses ?? []}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ["products-with-category"] });
            qc.invalidateQueries({ queryKey: ["stock-balances"] });
          }}
        />
      )}
    </div>
  );
}

function SummaryBadge({ status, count }: { status: StatusKey; count: number }) {
  const Icon = STATUS_ICON[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-medium ${STATUS_STYLE[status]}`}
    >
      <Icon className="h-3 w-3" />
      {STATUS_LABEL[status]}: {count}
    </span>
  );
}

// =================== Диалог редактирования ===================

function EditStockDialog({
  balance,
  onClose,
  onSaved,
}: {
  balance: StockBalance;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [available, setAvailable] = useState(String(balance.available ?? 0));
  const [reserved, setReserved] = useState(String(balance.reserved ?? 0));
  const [inTransit, setInTransit] = useState(String(balance.in_transit ?? 0));
  const [minStock, setMinStock] = useState(String(balance.min_stock ?? 0));
  const [author, setAuthor] = useState("");
  const [comment, setComment] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const newAvailable = Number(available);
      const newReserved = Number(reserved);
      const newInTransit = Number(inTransit);
      const newMin = Number(minStock);

      if ([newAvailable, newReserved, newInTransit, newMin].some((v) => Number.isNaN(v) || v < 0)) {
        throw new Error("Значения должны быть неотрицательными числами");
      }
      if (!balance.warehouse_id) {
        throw new Error("У позиции не указан склад — отредактируйте товар");
      }
      const actor = author.trim() || "Склад";
      const note = comment.trim() || null;

      // Хелпер для записи в журнал движения (без затрагивания остатка)
      const logMovement = async (params: {
        type: "adjustment" | "inbound" | "outbound";
        qty: number;
        reason: string;
        comment: string;
      }) => {
        if (params.qty === 0) return;
        const { error } = await db.from("stock_movements").insert({
          product_id: balance.product_id,
          warehouse_id: balance.warehouse_id,
          movement_type: params.type,
          qty: params.qty,
          reason: params.reason,
          comment: note ? `${params.comment} · ${note}` : params.comment,
          created_by: actor,
        });
        if (error) throw error;
      };

      // 1) Целевой on_hand = доступно + резерв → корректировка
      const targetOnHand = newAvailable + newReserved;
      const onHandDiff = targetOnHand - Number(balance.on_hand ?? 0);
      if (onHandDiff !== 0) {
        await logMovement({
          type: "adjustment",
          qty: onHandDiff,
          reason: "manual_edit",
          comment: "Ручная корректировка остатка",
        });
      }

      // 2) Корректировка резерва
      const reservedDiff = newReserved - Number(balance.reserved ?? 0);
      if (reservedDiff !== 0) {
        if (reservedDiff > 0) {
          const { error } = await db.from("stock_reservations").insert({
            product_id: balance.product_id,
            warehouse_id: balance.warehouse_id,
            qty: reservedDiff,
            status: "active",
          });
          if (error) throw error;
        } else {
          let remaining = -reservedDiff;
          const { data: reservations, error: rerr } = await db
            .from("stock_reservations")
            .select("id, qty")
            .eq("product_id", balance.product_id)
            .eq("warehouse_id", balance.warehouse_id)
            .eq("status", "active")
            .order("created_at", { ascending: false });
          if (rerr) throw rerr;
          for (const r of reservations ?? []) {
            if (remaining <= 0) break;
            const q = Number(r.qty);
            if (q <= remaining) {
              const { error } = await db
                .from("stock_reservations")
                .update({ status: "released" })
                .eq("id", r.id);
              if (error) throw error;
              remaining -= q;
            } else {
              const { error } = await db
                .from("stock_reservations")
                .update({ qty: q - remaining })
                .eq("id", r.id);
              if (error) throw error;
              remaining = 0;
            }
          }
        }
        await logMovement({
          type: "adjustment",
          qty: Math.abs(reservedDiff),
          reason: "manual_reserved_change",
          comment: `Резерв: ${reservedDiff > 0 ? "+" : "−"}${Math.abs(reservedDiff)}`,
        });
      }

      // 3) Корректировка «в пути»
      const transitDiff = newInTransit - Number(balance.in_transit ?? 0);
      if (transitDiff !== 0) {
        if (transitDiff > 0) {
          const { error } = await db.from("supply_in_transit").insert({
            product_id: balance.product_id,
            destination_warehouse_id: balance.warehouse_id,
            source_type: "supplier",
            source_name: "Ручная корректировка",
            qty: transitDiff,
            status: "in_transit",
            comment: "Ручная корректировка «в пути»",
          });
          if (error) throw error;
        } else {
          let remaining = -transitDiff;
          const { data: transits, error: terr } = await db
            .from("supply_in_transit")
            .select("id, qty")
            .eq("product_id", balance.product_id)
            .eq("destination_warehouse_id", balance.warehouse_id)
            .eq("status", "in_transit")
            .order("created_at", { ascending: false });
          if (terr) throw terr;
          for (const t of transits ?? []) {
            if (remaining <= 0) break;
            const q = Number(t.qty);
            if (q <= remaining) {
              const { error } = await db
                .from("supply_in_transit")
                .update({ status: "cancelled" })
                .eq("id", t.id);
              if (error) throw error;
              remaining -= q;
            } else {
              const { error } = await db
                .from("supply_in_transit")
                .update({ qty: q - remaining })
                .eq("id", t.id);
              if (error) throw error;
              remaining = 0;
            }
          }
        }
        await logMovement({
          type: "adjustment",
          qty: Math.abs(transitDiff),
          reason: "manual_in_transit_change",
          comment: `В пути: ${transitDiff > 0 ? "+" : "−"}${Math.abs(transitDiff)}`,
        });
      }

      // 4) Минимальный остаток
      if (newMin !== Number(balance.min_stock ?? 0)) {
        const { error } = await db
          .from("product_stock_settings")
          .upsert(
            {
              product_id: balance.product_id,
              warehouse_id: balance.warehouse_id,
              min_stock: newMin,
            },
            { onConflict: "product_id,warehouse_id" },
          );
        if (error) throw error;
        await logMovement({
          type: "adjustment",
          qty: 0,
          reason: "manual_min_stock_change",
          comment: `Мин. остаток: ${balance.min_stock} → ${newMin}`,
        });
      }
    },
    onSuccess: () => {
      toast.success("Остатки обновлены");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message ?? "Не удалось сохранить"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Изменить остатки</DialogTitle>
          <DialogDescription>
            {balance.product_name} · {balance.warehouse_name ?? "склад не указан"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div>
            <Label>Доступно</Label>
            <Input
              type="number"
              min="0"
              step="any"
              value={available}
              onChange={(e) => setAvailable(e.target.value)}
            />
          </div>
          <div>
            <Label>Зарезервировано</Label>
            <Input
              type="number"
              min="0"
              step="any"
              value={reserved}
              onChange={(e) => setReserved(e.target.value)}
            />
          </div>
          <div>
            <Label>В пути</Label>
            <Input
              type="number"
              min="0"
              step="any"
              value={inTransit}
              onChange={(e) => setInTransit(e.target.value)}
            />
          </div>
          <div>
            <Label>Минимальный остаток</Label>
            <Input
              type="number"
              min="0"
              step="any"
              value={minStock}
              onChange={(e) => setMinStock(e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <Label>Кто внёс изменение</Label>
            <Input
              placeholder="Имя кладовщика"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <Label>Комментарий</Label>
            <Input
              placeholder="Основание / пояснение"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Сохранение…" : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =================== Диалог создания товара ===================

function CreateProductDialog({
  warehouses,
  onClose,
  onCreated,
}: {
  warehouses: Warehouse[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [unit, setUnit] = useState("шт");
  const [category, setCategory] = useState("");
  const [warehouseId, setWarehouseId] = useState<string>(warehouses[0]?.id ?? "");
  const [initialQty, setInitialQty] = useState("0");
  const [minStock, setMinStock] = useState("0");

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Укажите название товара");
      if (!warehouseId) throw new Error("Выберите склад");
      const qty = Number(initialQty);
      const min = Number(minStock);
      if (Number.isNaN(qty) || qty < 0) throw new Error("Некорректный начальный остаток");
      if (Number.isNaN(min) || min < 0) throw new Error("Некорректный мин. остаток");

      const { data: prod, error } = await db
        .from("products")
        .insert({
          name: name.trim(),
          sku: sku.trim() || null,
          unit: unit.trim() || null,
          category: category.trim() || null,
          warehouse_id: warehouseId,
          source: "manual",
        })
        .select("id")
        .single();
      if (error) throw error;

      if (qty > 0) {
        const { error: mErr } = await db.from("stock_movements").insert({
          product_id: prod.id,
          warehouse_id: warehouseId,
          movement_type: "inbound",
          qty,
          reason: "initial_stock",
          comment: "Начальный остаток",
        });
        if (mErr) throw mErr;
      }

      if (min > 0) {
        const { error: sErr } = await db.from("product_stock_settings").upsert(
          {
            product_id: prod.id,
            warehouse_id: warehouseId,
            min_stock: min,
          },
          { onConflict: "product_id,warehouse_id" },
        );
        if (sErr) throw sErr;
      }
    },
    onSuccess: () => {
      toast.success("Товар добавлен");
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message ?? "Не удалось создать товар"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Добавить товар</DialogTitle>
          <DialogDescription>Создание новой позиции с начальным остатком</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="col-span-2">
            <Label>Название *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Артикул (SKU)</Label>
            <Input value={sku} onChange={(e) => setSku(e.target.value)} />
          </div>
          <div>
            <Label>Единица</Label>
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
          </div>
          <div>
            <Label>Категория</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div>
            <Label>Склад *</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите склад" />
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
          <div>
            <Label>Начальный остаток</Label>
            <Input
              type="number"
              min="0"
              step="any"
              value={initialQty}
              onChange={(e) => setInitialQty(e.target.value)}
            />
          </div>
          <div>
            <Label>Минимальный остаток</Label>
            <Input
              type="number"
              min="0"
              step="any"
              value={minStock}
              onChange={(e) => setMinStock(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? "Создание…" : "Создать"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
