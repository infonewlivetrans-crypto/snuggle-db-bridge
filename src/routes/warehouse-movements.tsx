import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/AppHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeftRight, Search, History } from "lucide-react";

export const Route = createFileRoute("/warehouse-movements")({
  head: () => ({
    meta: [
      { title: "Движение товара — Радиус Трек" },
      { name: "description", content: "Журнал движения товара по складам" },
    ],
  }),
  component: WarehouseMovementsPage,
  validateSearch: (s: Record<string, unknown>) => ({
    productId: typeof s.productId === "string" ? s.productId : undefined,
  }),
});

export type MovementType =
  | "inbound"
  | "outbound"
  | "return"
  | "transfer"
  | "adjustment"
  | "writeoff"
  | "reservation_release";

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  inbound: "Приход",
  outbound: "Отгрузка",
  return: "Возврат",
  transfer: "Перемещение",
  adjustment: "Корректировка",
  writeoff: "Списание",
  reservation_release: "Освобождение резерва",
};

export const MOVEMENT_STYLE: Record<MovementType, string> = {
  inbound: "border-green-300 bg-green-100 text-green-900",
  outbound: "border-blue-300 bg-blue-100 text-blue-900",
  return: "border-amber-300 bg-amber-100 text-amber-900",
  transfer: "border-purple-300 bg-purple-100 text-purple-900",
  adjustment: "border-slate-300 bg-slate-100 text-slate-900",
  writeoff: "border-red-300 bg-red-100 text-red-900",
  reservation_release: "border-zinc-300 bg-zinc-100 text-zinc-900",
};

type Movement = {
  id: string;
  product_id: string;
  warehouse_id: string;
  movement_type: MovementType;
  qty: number;
  reason: string | null;
  comment: string | null;
  created_at: string;
  created_by: string | null;
};

type Product = { id: string; name: string; sku: string | null; unit: string | null };
type Warehouse = { id: string; name: string };

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtQty(n: number) {
  return Number(n).toLocaleString("ru-RU");
}

function WarehouseMovementsPage() {
  const { productId } = Route.useSearch();
  const [query, setQuery] = useState("");
  const [warehouseId, setWarehouseId] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [productFilter, setProductFilter] = useState<string>(productId ?? "all");

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
    queryKey: ["products-min"],
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await db
        .from("products")
        .select("id, name, sku, unit")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });

  const { data: movements, isLoading } = useQuery({
    queryKey: ["stock-movements", productFilter],
    queryFn: async (): Promise<Movement[]> => {
      let q = db
        .from("stock_movements")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (productFilter !== "all") q = q.eq("product_id", productFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Movement[];
    },
  });

  const productMap = useMemo(() => {
    const m = new Map<string, Product>();
    (products ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [products]);

  const whMap = useMemo(() => {
    const m = new Map<string, Warehouse>();
    (warehouses ?? []).forEach((w) => m.set(w.id, w));
    return m;
  }, [warehouses]);

  const focusProduct = productFilter !== "all" ? productMap.get(productFilter) : null;

  const filtered = useMemo(() => {
    const qq = query.trim().toLowerCase();
    return (movements ?? []).filter((m) => {
      if (warehouseId !== "all" && m.warehouse_id !== warehouseId) return false;
      if (typeFilter !== "all" && m.movement_type !== typeFilter) return false;
      if (!qq) return true;
      const p = productMap.get(m.product_id);
      const w = whMap.get(m.warehouse_id);
      return (
        (p?.name ?? "").toLowerCase().includes(qq) ||
        (p?.sku ?? "").toLowerCase().includes(qq) ||
        (w?.name ?? "").toLowerCase().includes(qq) ||
        (m.reason ?? "").toLowerCase().includes(qq) ||
        (m.comment ?? "").toLowerCase().includes(qq) ||
        (m.created_by ?? "").toLowerCase().includes(qq)
      );
    });
  }, [movements, query, warehouseId, typeFilter, productMap, whMap]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
              <ArrowLeftRight className="h-6 w-6 text-primary" />
              Движение товара
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Журнал всех приходов, отгрузок, возвратов, перемещений и корректировок
            </p>
          </div>
          {focusProduct && (
            <Card className="border-primary/40 bg-primary/5">
              <CardContent className="flex items-center gap-3 px-4 py-3">
                <History className="h-5 w-5 text-primary" />
                <div>
                  <div className="text-xs uppercase text-muted-foreground">История по товару</div>
                  <div className="text-sm font-semibold">{focusProduct.name}</div>
                  {focusProduct.sku && (
                    <div className="font-mono text-xs text-muted-foreground">{focusProduct.sku}</div>
                  )}
                </div>
                <Link
                  to="/warehouse-movements"
                  search={{ productId: undefined }}
                  className="ml-2 text-xs text-primary underline"
                  onClick={() => setProductFilter("all")}
                >
                  Сбросить
                </Link>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Фильтры */}
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Поиск по товару, складу, основанию или автору"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={productFilter} onValueChange={setProductFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Товар" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все товары</SelectItem>
              {(products ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger className="w-[180px]">
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
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Тип движения" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все типы</SelectItem>
              {(Object.keys(MOVEMENT_LABEL) as MovementType[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {MOVEMENT_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата и время</TableHead>
                  <TableHead>Склад</TableHead>
                  <TableHead>Товар</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead className="text-right">Кол-во</TableHead>
                  <TableHead>Основание</TableHead>
                  <TableHead>Комментарий</TableHead>
                  <TableHead>Автор</TableHead>
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
                      Записей нет
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((m) => {
                    const p = productMap.get(m.product_id);
                    const w = whMap.get(m.warehouse_id);
                    const t = m.movement_type as MovementType;
                    const sign = m.qty > 0 ? "+" : "";
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {fmtDateTime(m.created_at)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {w?.name ?? <span className="italic text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          {p ? (
                            <Link
                              to="/warehouse-movements"
                              search={{ productId: p.id }}
                              onClick={() => setProductFilter(p.id)}
                              className="font-medium text-primary hover:underline"
                            >
                              {p.name}
                            </Link>
                          ) : (
                            <span className="italic text-muted-foreground">товар не найден</span>
                          )}
                          {p?.sku && (
                            <div className="font-mono text-xs text-muted-foreground">{p.sku}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={MOVEMENT_STYLE[t] ?? MOVEMENT_STYLE.adjustment}
                          >
                            {MOVEMENT_LABEL[t] ?? t}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">
                          {sign}
                          {fmtQty(m.qty)} {p?.unit ?? ""}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {m.reason ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {m.comment ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {m.created_by ?? "—"}
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
    </div>
  );
}
