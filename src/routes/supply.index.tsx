import { createFileRoute } from "@tanstack/react-router";
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
import { PackageSearch, Search, AlertTriangle, AlertCircle, CircleDashed, CircleCheck, Truck, ClipboardList } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/supply/")({
  head: () => ({
    meta: [
      { title: "Снабжение — Радиус Трек" },
      { name: "description", content: "Контроль остатков, дефицита и поставок в пути" },
    ],
  }),
  component: SupplyPage,
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

const LEVEL_LABELS: Record<StockBalance["deficit_level"], string> = {
  ok: "Норма",
  low: "Низкий",
  critical: "Критический",
  out: "Нет в наличии",
};

const LEVEL_STYLES: Record<StockBalance["deficit_level"], string> = {
  ok: "border-green-300 bg-green-100 text-green-900",
  low: "border-amber-300 bg-amber-100 text-amber-900",
  critical: "border-orange-300 bg-orange-100 text-orange-900",
  out: "border-red-300 bg-red-100 text-red-900",
};

const LEVEL_ICONS: Record<StockBalance["deficit_level"], typeof CircleCheck> = {
  ok: CircleCheck,
  low: CircleDashed,
  critical: AlertTriangle,
  out: AlertCircle,
};

function SupplyPage() {
  const [query, setQuery] = useState("");
  const [warehouseId, setWarehouseId] = useState<string>("all");
  const [level, setLevel] = useState<string>("all");

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

  const { data: balances, isLoading } = useQuery({
    queryKey: ["stock-balances"],
    queryFn: async (): Promise<StockBalance[]> => {
      const { data, error } = await db
        .from("stock_balances")
        .select("*")
        .order("deficit_level", { ascending: true })
        .order("product_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as StockBalance[];
    },
  });

  const counts = useMemo(() => {
    const c = { ok: 0, low: 0, critical: 0, out: 0 };
    (balances ?? []).forEach((b) => {
      c[b.deficit_level] += 1;
    });
    return c;
  }, [balances]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (balances ?? []).filter((b) => {
      if (warehouseId !== "all" && b.warehouse_id !== warehouseId) return false;
      if (level !== "all" && b.deficit_level !== level) return false;
      if (!q) return true;
      return (
        b.product_name.toLowerCase().includes(q) ||
        (b.sku ?? "").toLowerCase().includes(q) ||
        (b.warehouse_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [balances, query, warehouseId, level]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
              <PackageSearch className="h-6 w-6 text-primary" />
              Снабжение
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Остатки, резервы, поставки в пути и дефицит по складам
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <SummaryBadge level="out" count={counts.out} />
            <SummaryBadge level="critical" count={counts.critical} />
            <SummaryBadge level="low" count={counts.low} />
            <SummaryBadge level="ok" count={counts.ok} />
          </div>
        </div>

        {/* Фильтры */}
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Поиск по товару, артикулу или складу"
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
          <Select value={level} onValueChange={setLevel}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Уровень" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все уровни</SelectItem>
              <SelectItem value="out">Нет в наличии</SelectItem>
              <SelectItem value="critical">Критический</SelectItem>
              <SelectItem value="low">Низкий</SelectItem>
              <SelectItem value="ok">Норма</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Таблица */}
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Товар</TableHead>
                <TableHead>Склад</TableHead>
                <TableHead className="text-right">На складе</TableHead>
                <TableHead className="text-right">Резерв</TableHead>
                <TableHead className="text-right">Доступно</TableHead>
                <TableHead className="text-right">В пути</TableHead>
                <TableHead className="text-right">Мин.</TableHead>
                <TableHead>Статус</TableHead>
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
                    По выбранным фильтрам ничего не найдено
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((b) => {
                  const Icon = LEVEL_ICONS[b.deficit_level];
                  return (
                    <TableRow key={`${b.product_id}-${b.warehouse_id ?? "none"}`}>
                      <TableCell>
                        <div className="font-medium text-foreground">{b.product_name}</div>
                        {b.sku && (
                          <div className="font-mono text-xs text-muted-foreground">{b.sku}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-foreground">
                        {b.warehouse_name ?? <span className="italic text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmt(b.on_hand)} {b.unit ?? ""}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        {fmt(b.reserved)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold text-foreground">
                        {fmt(b.available)}
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
                        <Badge variant="outline" className={LEVEL_STYLES[b.deficit_level]}>
                          <Icon className="mr-1 h-3 w-3" />
                          {LEVEL_LABELS[b.deficit_level]}
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

function SummaryBadge({ level, count }: { level: StockBalance["deficit_level"]; count: number }) {
  const Icon = LEVEL_ICONS[level];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-medium ${LEVEL_STYLES[level]}`}
    >
      <Icon className="h-3 w-3" />
      {LEVEL_LABELS[level]}: {count}
    </span>
  );
}

function fmt(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("ru-RU");
}
