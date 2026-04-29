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
import { Package } from "lucide-react";

export type OrderItem = {
  id: string;
  order_id: string;
  nomenclature: string;
  characteristic: string | null;
  quality: string | null;
  qty: number;
  unit: string | null;
  weight_kg: number | null;
  volume_m3: number | null;
  order_amount: number | null;
  delivery_amount: number | null;
  comment: string | null;
};

function fmt(n: number | null | undefined, digits = 2) {
  if (n == null) return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("ru-RU", { maximumFractionDigits: digits });
}

/**
 * Состав заказа — структура, как в 1С: номенклатура, характеристика,
 * количество, вес, объём, комментарий. Подключено к таблице order_items.
 */
export function OrderItemsBlock({ orderId }: { orderId: string }) {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["order-items", orderId],
    queryFn: async () => {
      const { data, error } = await db
        .from("order_items")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OrderItem[];
    },
  });

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Package className="h-4 w-4" />
          Состав заказа
        </div>
        <div className="text-xs text-muted-foreground">
          Позиций: {items.length}
        </div>
      </div>
      {isLoading ? (
        <div className="p-4 text-sm text-muted-foreground">Загрузка…</div>
      ) : items.length === 0 ? (
        <div className="p-4 text-sm italic text-muted-foreground">
          Состав заказа пока не загружен (будет заполнен из 1С или вручную)
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Товар</TableHead>
              <TableHead>Характеристика</TableHead>
              <TableHead className="text-right">Кол-во</TableHead>
              <TableHead className="text-right">Вес, кг</TableHead>
              <TableHead className="text-right">Объём, м³</TableHead>
              <TableHead>Комментарий</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => (
              <TableRow key={it.id}>
                <TableCell className="font-medium">{it.nomenclature}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {it.characteristic ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  {fmt(it.qty, 3)} {it.unit ?? ""}
                </TableCell>
                <TableCell className="text-right">{fmt(it.weight_kg)}</TableCell>
                <TableCell className="text-right">{fmt(it.volume_m3, 3)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {it.comment ?? ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
