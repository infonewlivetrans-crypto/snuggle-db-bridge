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
import { Boxes } from "lucide-react";

type OrderRow = { id: string; order_number: string; onec_order_number: string | null };
type ItemRow = {
  id: string;
  order_id: string;
  nomenclature: string;
  qty: number;
  unit: string | null;
  weight_kg: number | null;
  volume_m3: number | null;
  order_amount: number | null;
  delivery_amount: number | null;
};

function fmt(n: number | null | undefined, digits = 2) {
  if (n == null) return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("ru-RU", { maximumFractionDigits: digits });
}

/**
 * Товары из заказов — агрегированный список товаров по всем заказам заявки
 * (как в 1С в карточке заявки на транспорт).
 */
export function RequestOrderItemsBlock({ requestId }: { requestId: string }) {
  // 1) Заказы заявки (через route_points → orders)
  const { data: orders = [] } = useQuery({
    queryKey: ["request-orders-min", requestId],
    queryFn: async () => {
      const { data: pts, error: ptsErr } = await db
        .from("route_points")
        .select("order_id")
        .eq("route_id", requestId);
      if (ptsErr) throw ptsErr;
      const ids = Array.from(
        new Set((pts ?? []).map((p: { order_id: string }) => p.order_id).filter(Boolean)),
      );
      if (ids.length === 0) return [] as OrderRow[];
      const { data, error } = await db
        .from("orders")
        .select("id, order_number, onec_order_number")
        .in("id", ids);
      if (error) throw error;
      return (data ?? []) as OrderRow[];
    },
  });

  const orderIds = orders.map((o) => o.id);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["request-order-items", requestId, orderIds.join(",")],
    enabled: orderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await db
        .from("order_items")
        .select("*")
        .in("order_id", orderIds)
        .order("order_id", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ItemRow[];
    },
  });

  const orderMap = new Map(orders.map((o) => [o.id, o]));

  const totals = items.reduce(
    (acc, it) => {
      acc.qty += Number(it.qty) || 0;
      acc.weight += Number(it.weight_kg) || 0;
      acc.volume += Number(it.volume_m3) || 0;
      acc.order += Number(it.order_amount) || 0;
      acc.delivery += Number(it.delivery_amount) || 0;
      return acc;
    },
    { qty: 0, weight: 0, volume: 0, order: 0, delivery: 0 },
  );

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Boxes className="h-4 w-4" />
          Товары из заказов
        </div>
        <div className="text-xs text-muted-foreground">
          Заказов: {orders.length} · Позиций: {items.length}
        </div>
      </div>
      {orderIds.length === 0 ? (
        <div className="p-4 text-sm italic text-muted-foreground">
          В заявке пока нет заказов
        </div>
      ) : isLoading ? (
        <div className="p-4 text-sm text-muted-foreground">Загрузка…</div>
      ) : items.length === 0 ? (
        <div className="p-4 text-sm italic text-muted-foreground">
          Состав заказов пока не загружен (будет заполнен из 1С или вручную)
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Заказ</TableHead>
              <TableHead>Номенклатура</TableHead>
              <TableHead className="text-right">Кол-во</TableHead>
              <TableHead className="text-right">Вес, кг</TableHead>
              <TableHead className="text-right">Объём, м³</TableHead>
              <TableHead className="text-right">Сумма заказа</TableHead>
              <TableHead className="text-right">Сумма доставки</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => {
              const o = orderMap.get(it.order_id);
              return (
                <TableRow key={it.id}>
                  <TableCell className="font-mono text-xs">
                    {o?.onec_order_number || o?.order_number || "—"}
                  </TableCell>
                  <TableCell>{it.nomenclature}</TableCell>
                  <TableCell className="text-right">
                    {fmt(it.qty, 3)} {it.unit ?? ""}
                  </TableCell>
                  <TableCell className="text-right">{fmt(it.weight_kg)}</TableCell>
                  <TableCell className="text-right">{fmt(it.volume_m3, 3)}</TableCell>
                  <TableCell className="text-right">{fmt(it.order_amount)}</TableCell>
                  <TableCell className="text-right">{fmt(it.delivery_amount)}</TableCell>
                </TableRow>
              );
            })}
            <TableRow className="bg-muted/40 font-medium">
              <TableCell colSpan={2} className="text-right">
                Итого
              </TableCell>
              <TableCell className="text-right">{fmt(totals.qty, 3)}</TableCell>
              <TableCell className="text-right">{fmt(totals.weight)}</TableCell>
              <TableCell className="text-right">{fmt(totals.volume, 3)}</TableCell>
              <TableCell className="text-right">{fmt(totals.order)}</TableCell>
              <TableCell className="text-right">{fmt(totals.delivery)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )}
    </div>
  );
}
