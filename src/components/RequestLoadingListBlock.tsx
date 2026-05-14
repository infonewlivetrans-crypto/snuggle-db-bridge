import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PackageCheck, AlertTriangle, CheckCircle2 } from "lucide-react";

type Pt = { order_id: string };
type Item = {
  id: string;
  order_id: string;
  product_id: string | null;
  nomenclature: string;
  unit: string | null;
  qty: number;
  weight_kg: number | null;
  volume_m3: number | null;
};

type StockBal = {
  product_id: string;
  available: number;
  warehouse_id: string | null;
};

function fmt(n: number, digits = 2) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("ru-RU", { maximumFractionDigits: digits });
}

/**
 * Список товаров к загрузке — агрегирован из заказов заявки.
 * Одинаковые товары объединяются в одну строку.
 * Сверяет с остатками на складе отгрузки и помечает «хватает / не хватает».
 */
export function RequestLoadingListBlock({
  requestId,
  warehouseId,
}: {
  requestId: string;
  warehouseId: string | null;
}) {
  const { data: pts = [] } = useQuery({
    queryKey: ["loading-list-points", requestId],
    queryFn: async () => {
      const { data, error } = await db
        .from("route_points")
        .select("order_id")
        .eq("route_id", requestId);
      if (error) throw error;
      return (data ?? []) as Pt[];
    },
  });

  const orderIds = useMemo(
    () => Array.from(new Set(pts.map((p) => p.order_id).filter(Boolean))),
    [pts],
  );

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["loading-list-items", requestId, orderIds.join(",")],
    enabled: orderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await db
        .from("order_items")
        .select(
          "id, order_id, product_id, nomenclature, unit, qty, weight_kg, volume_m3",
        )
        .in("order_id", orderIds);
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });

  // Агрегация по товару (product_id если есть, иначе nomenclature)
  const aggregated = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        product_id: string | null;
        nomenclature: string;
        unit: string | null;
        qty: number;
        weight: number;
        volume: number;
      }
    >();
    for (const it of items) {
      const key = it.product_id ?? `name:${it.nomenclature}`;
      const cur = map.get(key);
      const qty = Number(it.qty) || 0;
      const w = Number(it.weight_kg) || 0;
      const v = Number(it.volume_m3) || 0;
      if (cur) {
        cur.qty += qty;
        cur.weight += w;
        cur.volume += v;
      } else {
        map.set(key, {
          key,
          product_id: it.product_id,
          nomenclature: it.nomenclature,
          unit: it.unit,
          qty,
          weight: w,
          volume: v,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.nomenclature.localeCompare(b.nomenclature, "ru"),
    );
  }, [items]);

  const productIds = aggregated
    .map((a) => a.product_id)
    .filter((x): x is string => !!x);

  const { data: balances = [] } = useQuery({
    queryKey: ["loading-list-stock", warehouseId, productIds.join(",")],
    enabled: !!warehouseId && productIds.length > 0,
    queryFn: async () => {
      const { data, error } = await db
        .from("stock_balances")
        .select("product_id, available, warehouse_id")
        .eq("warehouse_id", warehouseId)
        .in("product_id", productIds);
      if (error) throw error;
      return (data ?? []) as StockBal[];
    },
  });

  const availableByProduct = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of balances) m.set(b.product_id, Number(b.available) || 0);
    return m;
  }, [balances]);

  const totals = aggregated.reduce(
    (acc, a) => {
      acc.qty += a.qty;
      acc.weight += a.weight;
      acc.volume += a.volume;
      return acc;
    },
    { qty: 0, weight: 0, volume: 0 },
  );

  const shortageCount = aggregated.filter((a) => {
    if (!a.product_id || !warehouseId) return false;
    const av = availableByProduct.get(a.product_id) ?? 0;
    return av < a.qty;
  }).length;

  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <PackageCheck className="h-4 w-4" />
          Список товаров к загрузке
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Позиций: {aggregated.length}</span>
          {warehouseId && aggregated.length > 0 && (
            shortageCount > 0 ? (
              <Badge
                variant="outline"
                className="border-red-300 bg-red-100 text-red-900"
              >
                <AlertTriangle className="mr-1 h-3 w-3" />
                Не хватает: {shortageCount}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-green-300 bg-green-100 text-green-900"
              >
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Хватает на складе
              </Badge>
            )
          )}
        </div>
      </div>

      {orderIds.length === 0 ? (
        <div className="p-4 text-sm italic text-muted-foreground">
          В заявке пока нет заказов
        </div>
      ) : isLoading ? (
        <div className="p-4 text-sm text-muted-foreground">Загрузка…</div>
      ) : aggregated.length === 0 ? (
        <div className="p-4 text-sm italic text-muted-foreground">
          В заказах заявки пока нет позиций
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Товар</TableHead>
              <TableHead className="text-right">Кол-во</TableHead>
              <TableHead className="text-right">Вес, кг</TableHead>
              <TableHead className="text-right">Объём, м³</TableHead>
              <TableHead className="text-right">На складе</TableHead>
              <TableHead>Статус</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {aggregated.map((a) => {
              const av = a.product_id
                ? availableByProduct.get(a.product_id) ?? 0
                : null;
              const enough = warehouseId && a.product_id ? (av ?? 0) >= a.qty : null;
              return (
                <TableRow key={a.key}>
                  <TableCell className="font-medium">{a.nomenclature}</TableCell>
                  <TableCell className="text-right">
                    {fmt(a.qty, 3)} {a.unit ?? ""}
                  </TableCell>
                  <TableCell className="text-right">{fmt(a.weight)}</TableCell>
                  <TableCell className="text-right">{fmt(a.volume, 3)}</TableCell>
                  <TableCell className="text-right">
                    {!warehouseId ? (
                      <span className="text-xs italic text-muted-foreground">
                        склад не указан
                      </span>
                    ) : !a.product_id ? (
                      <span className="text-xs italic text-muted-foreground">
                        нет товара в каталоге
                      </span>
                    ) : (
                      fmt(av ?? 0, 3)
                    )}
                  </TableCell>
                  <TableCell>
                    {enough === null ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : enough ? (
                      <Badge
                        variant="outline"
                        className="border-green-300 bg-green-100 text-green-900"
                      >
                        Хватает
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-red-300 bg-red-100 text-red-900"
                      >
                        <AlertTriangle className="mr-1 h-3 w-3" />
                        Недостаточно товара для загрузки
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            <TableRow className="bg-muted/40 font-medium">
              <TableCell className="text-right">Итого</TableCell>
              <TableCell className="text-right">{fmt(totals.qty, 3)}</TableCell>
              <TableCell className="text-right">{fmt(totals.weight)}</TableCell>
              <TableCell className="text-right">{fmt(totals.volume, 3)}</TableCell>
              <TableCell colSpan={2} />
            </TableRow>
          </TableBody>
        </Table>
      )}
    </div>
  );
}
