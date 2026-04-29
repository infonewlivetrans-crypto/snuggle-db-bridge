import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PackageCheck, AlertTriangle, CheckCircle2, Truck } from "lucide-react";
import { toast } from "sonner";

type Pt = { order_id: string };
type Item = {
  id: string;
  order_id: string;
  product_id: string | null;
  nomenclature: string;
  unit: string | null;
  qty: number;
};
type Loaded = {
  id: string;
  product_id: string | null;
  nomenclature: string;
  qty_loaded: number;
};
type Bal = { product_id: string; available: number };

function fmt(n: number, digits = 3) {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("ru-RU", { maximumFractionDigits: digits });
}

/**
 * Чек-лист загрузки для конкретной отгрузки на складе.
 * Источник «нужно загрузить» — заказы маршрута (route_points → order_items, агрегировано).
 * «Уже загружено» — сумма по dock_loaded_items для этого delivery_route_id.
 * При подтверждении: списывает остаток (stock_movements movement_type='shipment')
 * и создаёт запись в dock_loaded_items.
 */
export function DockLoadingChecklistBlock({
  deliveryRouteId,
  warehouseId,
  routeNumber,
}: {
  deliveryRouteId: string;
  warehouseId: string | null;
  routeNumber?: string | null;
}) {
  const qc = useQueryClient();

  // 1. Точки маршрута → заказы
  const { data: pts = [] } = useQuery({
    queryKey: ["dock-load-points", deliveryRouteId],
    queryFn: async () => {
      const { data, error } = await db
        .from("route_points")
        .select("order_id")
        .eq("route_id", deliveryRouteId);
      if (error) throw error;
      return (data ?? []) as Pt[];
    },
  });

  const orderIds = useMemo(
    () => Array.from(new Set(pts.map((p) => p.order_id).filter(Boolean))),
    [pts],
  );

  // 2. Состав заказов
  const { data: items = [] } = useQuery({
    queryKey: ["dock-load-items", deliveryRouteId, orderIds.join(",")],
    enabled: orderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await db
        .from("order_items")
        .select("id, order_id, product_id, nomenclature, unit, qty")
        .in("order_id", orderIds);
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });

  // 3. Уже загружено
  const { data: loaded = [] } = useQuery({
    queryKey: ["dock-loaded", deliveryRouteId],
    queryFn: async () => {
      const { data, error } = await db
        .from("dock_loaded_items")
        .select("id, product_id, nomenclature, qty_loaded")
        .eq("delivery_route_id", deliveryRouteId);
      if (error) throw error;
      return (data ?? []) as Loaded[];
    },
  });

  // 4. Агрегация «надо загрузить»
  const required = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        product_id: string | null;
        nomenclature: string;
        unit: string | null;
        qty: number;
      }
    >();
    for (const it of items) {
      const key = it.product_id ?? `name:${it.nomenclature}`;
      const cur = map.get(key);
      const q = Number(it.qty) || 0;
      if (cur) cur.qty += q;
      else
        map.set(key, {
          key,
          product_id: it.product_id,
          nomenclature: it.nomenclature,
          unit: it.unit,
          qty: q,
        });
    }
    return Array.from(map.values()).sort((a, b) =>
      a.nomenclature.localeCompare(b.nomenclature, "ru"),
    );
  }, [items]);

  const loadedByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of loaded) {
      const key = l.product_id ?? `name:${l.nomenclature}`;
      m.set(key, (m.get(key) ?? 0) + (Number(l.qty_loaded) || 0));
    }
    return m;
  }, [loaded]);

  // 5. Остатки на складе
  const productIds = required
    .map((r) => r.product_id)
    .filter((x): x is string => !!x);

  const { data: balances = [] } = useQuery({
    queryKey: ["dock-load-stock", warehouseId, productIds.join(",")],
    enabled: !!warehouseId && productIds.length > 0,
    queryFn: async () => {
      const { data, error } = await db
        .from("stock_balances")
        .select("product_id, available")
        .eq("warehouse_id", warehouseId)
        .in("product_id", productIds);
      if (error) throw error;
      return (data ?? []) as Bal[];
    },
  });

  const availableByProduct = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of balances) m.set(b.product_id, Number(b.available) || 0);
    return m;
  }, [balances]);

  const [draft, setDraft] = useState<Record<string, string>>({});

  const confirmLoad = useMutation({
    mutationFn: async (args: {
      key: string;
      product_id: string | null;
      nomenclature: string;
      unit: string | null;
      qty: number;
    }) => {
      if (!warehouseId) throw new Error("Не указан склад отгрузки");
      if (args.qty <= 0) throw new Error("Количество должно быть больше 0");
      if (args.product_id) {
        const av = availableByProduct.get(args.product_id) ?? 0;
        if (av < args.qty) {
          throw new Error("Недостаточно товара для загрузки");
        }
      }

      // 1) запись в журнале загрузки
      const { error: e1 } = await db.from("dock_loaded_items").insert({
        delivery_route_id: deliveryRouteId,
        warehouse_id: warehouseId,
        product_id: args.product_id,
        nomenclature: args.nomenclature,
        unit: args.unit,
        qty_loaded: args.qty,
      });
      if (e1) throw e1;

      // 2) движение «отгрузка» (списание со склада)
      if (args.product_id) {
        const { error: e2 } = await db.from("stock_movements").insert({
          warehouse_id: warehouseId,
          product_id: args.product_id,
          movement_type: "shipment",
          qty: -args.qty,
          reason: "shipment_loaded",
          ref_route_id: deliveryRouteId,
          comment: routeNumber
            ? `Загрузка по маршруту ${routeNumber}: ${args.nomenclature}`
            : `Загрузка: ${args.nomenclature}`,
        });
        if (e2) throw e2;

        // 3) уменьшить активные резервы под исходную заявку
        const { data: dr } = await db
          .from("delivery_routes")
          .select("source_request_id")
          .eq("id", deliveryRouteId)
          .maybeSingle();
        const sourceRequestId = (dr as { source_request_id?: string } | null)
          ?.source_request_id;
        if (sourceRequestId) {
          const { data: actives } = await db
            .from("stock_reservations")
            .select("id, qty")
            .eq("transport_request_id", sourceRequestId)
            .eq("product_id", args.product_id)
            .eq("warehouse_id", warehouseId)
            .eq("status", "active");
          const list = (actives ?? []) as Array<{ id: string; qty: number }>;
          let toConsume = args.qty;
          let consumedTotal = 0;
          for (const r of list) {
            if (toConsume <= 0) break;
            const q = Number(r.qty) || 0;
            const take = Math.min(q, toConsume);
            const remain = q - take;
            if (remain <= 0) {
              await db
                .from("stock_reservations")
                .update({ status: "consumed" })
                .eq("id", r.id);
            } else {
              await db
                .from("stock_reservations")
                .update({ qty: remain })
                .eq("id", r.id);
            }
            toConsume -= take;
            consumedTotal += take;
          }
          if (consumedTotal > 0) {
            await db.from("stock_movements").insert({
              warehouse_id: warehouseId,
              product_id: args.product_id,
              movement_type: "reservation_consume",
              qty: consumedTotal,
              reason: "reservation_consumed_on_load",
              ref_route_id: deliveryRouteId,
              ref_transport_request_id: sourceRequestId,
              comment: routeNumber
                ? `Списание резерва при загрузке (маршрут ${routeNumber}): ${args.nomenclature}`
                : `Списание резерва при загрузке: ${args.nomenclature}`,
            });
          }
        }
      }
    },
    onSuccess: (_d, args) => {
      toast.success("Загрузка подтверждена");
      setDraft((d) => ({ ...d, [args.key]: "" }));
      qc.invalidateQueries({ queryKey: ["dock-loaded", deliveryRouteId] });
      qc.invalidateQueries({ queryKey: ["dock-load-stock"] });
      qc.invalidateQueries({ queryKey: ["stock-balances"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalShortage = required.filter((r) => {
    if (!r.product_id || !warehouseId) return false;
    const remain = r.qty - (loadedByKey.get(r.key) ?? 0);
    if (remain <= 0) return false;
    return (availableByProduct.get(r.product_id) ?? 0) < remain;
  }).length;

  return (
    <div className="rounded-md border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="inline-flex items-center gap-2 text-sm font-semibold">
          <Truck className="h-4 w-4" />
          Загрузка товара со склада
        </div>
        {warehouseId && required.length > 0 && (
          totalShortage > 0 ? (
            <Badge
              variant="outline"
              className="border-red-300 bg-red-100 text-red-900"
            >
              <AlertTriangle className="mr-1 h-3 w-3" />
              Не хватает: {totalShortage}
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-green-300 bg-green-100 text-green-900"
            >
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Товара хватает
            </Badge>
          )
        )}
      </div>

      {required.length === 0 ? (
        <div className="p-3 text-xs text-muted-foreground">
          Нет позиций для загрузки (нет состава заказов)
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Товар</TableHead>
              <TableHead className="text-right">Нужно</TableHead>
              <TableHead className="text-right">Загружено</TableHead>
              <TableHead className="text-right">Остаток к загрузке</TableHead>
              <TableHead className="text-right">На складе</TableHead>
              <TableHead className="w-[260px]">Подтвердить загрузку</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {required.map((r) => {
              const done = loadedByKey.get(r.key) ?? 0;
              const remain = Math.max(0, r.qty - done);
              const av = r.product_id
                ? availableByProduct.get(r.product_id) ?? 0
                : null;
              const enough =
                warehouseId && r.product_id ? (av ?? 0) >= remain : null;
              const isDone = remain <= 0;
              return (
                <TableRow key={r.key}>
                  <TableCell className="font-medium">{r.nomenclature}</TableCell>
                  <TableCell className="text-right">
                    {fmt(r.qty)} {r.unit ?? ""}
                  </TableCell>
                  <TableCell className="text-right">{fmt(done)}</TableCell>
                  <TableCell className="text-right">
                    {isDone ? (
                      <Badge
                        variant="outline"
                        className="border-green-300 bg-green-100 text-green-900"
                      >
                        Готово
                      </Badge>
                    ) : (
                      <span className="font-mono">{fmt(remain)}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {!warehouseId ? (
                      <span className="text-xs italic text-muted-foreground">
                        нет склада
                      </span>
                    ) : !r.product_id ? (
                      <span className="text-xs italic text-muted-foreground">
                        нет в каталоге
                      </span>
                    ) : (
                      <span
                        className={
                          enough === false
                            ? "font-mono text-red-700"
                            : "font-mono"
                        }
                      >
                        {fmt(av ?? 0)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {isDone ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          step="0.001"
                          className="h-8 w-24"
                          placeholder={String(remain)}
                          value={draft[r.key] ?? ""}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, [r.key]: e.target.value }))
                          }
                        />
                        <Button
                          size="sm"
                          variant={enough === false ? "outline" : "default"}
                          disabled={confirmLoad.isPending}
                          onClick={() => {
                            const raw = draft[r.key];
                            const qty = raw && raw.trim() !== "" ? Number(raw) : remain;
                            confirmLoad.mutate({
                              key: r.key,
                              product_id: r.product_id,
                              nomenclature: r.nomenclature,
                              unit: r.unit,
                              qty,
                            });
                          }}
                        >
                          <PackageCheck className="mr-1 h-3.5 w-3.5" />
                          Подтвердить
                        </Button>
                      </div>
                    )}
                    {enough === false && !isDone && (
                      <div className="mt-1 inline-flex items-center gap-1 text-xs text-red-700">
                        <AlertTriangle className="h-3 w-3" />
                        Недостаточно товара для загрузки
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
