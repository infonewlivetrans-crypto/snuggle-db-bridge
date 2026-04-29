import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Plus,
  PackageSearch,
} from "lucide-react";
import { toast } from "sonner";
import {
  notifyShortageForRequest,
  notifySupplyRequestCreated,
} from "@/lib/supplyNotifications";

type Pt = { order_id: string };
type Item = {
  id: string;
  order_id: string;
  product_id: string | null;
  nomenclature: string;
  unit: string | null;
  qty: number;
};
type Bal = { product_id: string; available: number };

function fmt(n: number, digits = 3) {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("ru-RU", { maximumFractionDigits: digits });
}

/**
 * Проверка наличия товара перед выдачей маршрута водителю.
 * Сообщает наружу через onShortageChange — есть ли дефицит,
 * чтобы родитель мог заблокировать кнопку «Создать маршрут».
 */
export function StockAvailabilityCheckBlock({
  requestId,
  warehouseId,
  routeNumber,
  onShortageChange,
}: {
  requestId: string;
  warehouseId: string | null;
  routeNumber?: string | null;
  onShortageChange?: (hasShortage: boolean) => void;
}) {
  const qc = useQueryClient();

  // 1. Заказы заявки
  const { data: pts = [] } = useQuery({
    queryKey: ["stock-check-points", requestId],
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

  // 2. Состав заказов
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["stock-check-items", requestId, orderIds.join(",")],
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

  // 3. Агрегация «нужно загрузить»
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

  // 4. Остатки на складе
  const productIds = required
    .map((r) => r.product_id)
    .filter((x): x is string => !!x);

  const { data: balances = [] } = useQuery({
    queryKey: ["stock-check-bal", warehouseId, productIds.join(",")],
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

  const availByProduct = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of balances) m.set(b.product_id, Number(b.available) || 0);
    return m;
  }, [balances]);

  // 4b. Собственные активные резервы по этой заявке — их нужно считать
  // как «доступно для нас», иначе после резервирования возникает ложный дефицит.
  const { data: ownReserv = [] } = useQuery({
    queryKey: ["stock-check-own-reserv", requestId, productIds.join(",")],
    enabled: productIds.length > 0,
    queryFn: async () => {
      const { data, error } = await db
        .from("stock_reservations")
        .select("product_id, qty")
        .eq("transport_request_id", requestId)
        .eq("status", "active")
        .in("product_id", productIds);
      if (error) throw error;
      return (data ?? []) as Array<{ product_id: string; qty: number }>;
    },
  });
  const ownReservByProduct = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of ownReserv) {
      m.set(r.product_id, (m.get(r.product_id) ?? 0) + (Number(r.qty) || 0));
    }
    return m;
  }, [ownReserv]);

  // 5. Расчёт дефицита (с учётом собственного резерва)
  const rows = useMemo(
    () =>
      required.map((r) => {
        const av = r.product_id ? availByProduct.get(r.product_id) ?? 0 : null;
        const ownRes = r.product_id
          ? ownReservByProduct.get(r.product_id) ?? 0
          : 0;
        const effective = (av ?? 0) + ownRes;
        const deficit = r.product_id ? Math.max(0, r.qty - effective) : 0;
        const hasProduct = !!r.product_id;
        const enough = !hasProduct ? null : effective >= r.qty;
        return { ...r, av, deficit, enough, hasProduct };
      }),
    [required, availByProduct, ownReservByProduct],
  );

  const hasShortage = rows.some((r) => r.enough === false);
  const allOk = warehouseId && rows.length > 0 && rows.every((r) => r.enough === true);

  // Сообщаем наружу
  useEffect(() => {
    onShortageChange?.(hasShortage);
  }, [hasShortage, onShortageChange]);

  // Уведомление снабжению о нехватке товара под заявку (по каждой позиции с дефицитом)
  useEffect(() => {
    if (!warehouseId || !routeNumber) return;
    const shortageRows = rows.filter(
      (r) => r.enough === false && r.product_id && r.deficit > 0,
    );
    if (shortageRows.length === 0) return;
    (async () => {
      const { data: wh } = await db
        .from("warehouses")
        .select("name")
        .eq("id", warehouseId)
        .maybeSingle();
      const whName = (wh as { name?: string } | null)?.name ?? null;
      for (const r of shortageRows) {
        await notifyShortageForRequest({
          transportRequestId: requestId,
          routeNumber,
          warehouseId,
          warehouseName: whName,
          productId: r.product_id as string,
          productName: r.nomenclature,
          deficit: r.deficit,
          unit: r.unit,
        });
      }
    })();
  }, [rows, warehouseId, routeNumber, requestId]);

  // 6. Создание заявки на пополнение
  const createSupply = useMutation({
    mutationFn: async (args: {
      product_id: string;
      qty: number;
      nomenclature: string;
      unit: string | null;
    }) => {
      if (!warehouseId) throw new Error("Не указан склад отгрузки");
      const reason = routeNumber
        ? `Нехватка товара под отгрузку (заявка ${routeNumber})`
        : "Нехватка товара под отгрузку";
      const { data: inserted, error } = await db
        .from("supply_requests")
        .insert({
          source_type: "factory",
          source_name: null,
          destination_warehouse_id: warehouseId,
          product_id: args.product_id,
          qty: args.qty,
          priority: "high",
          status: "draft",
          comment: `${reason}. Товар: ${args.nomenclature}. Дефицит: ${fmt(args.qty)}.`,
          created_by: "Логист",
        })
        .select("id, request_number")
        .single();
      if (error) throw error;
      // Уведомление снабжению
      const { data: wh } = await db
        .from("warehouses")
        .select("name")
        .eq("id", warehouseId)
        .maybeSingle();
      const whName = (wh as { name?: string } | null)?.name ?? null;
      await notifySupplyRequestCreated({
        supplyRequestId: (inserted as { id: string }).id,
        requestNumber: (inserted as { request_number: string }).request_number,
        warehouseId,
        warehouseName: whName,
        productId: args.product_id,
        productName: args.nomenclature,
        qty: args.qty,
        unit: args.unit,
        transportRequestId: requestId,
        routeNumber: routeNumber ?? null,
      });
    },
    onSuccess: () => {
      toast.success("Заявка на пополнение создана");
      qc.invalidateQueries({ queryKey: ["supply-requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <ShieldCheck className="h-4 w-4" />
          Проверка наличия товара
        </div>
        <div className="flex items-center gap-2 text-xs">
          {!warehouseId ? (
            <span className="italic text-muted-foreground">
              склад отгрузки не указан
            </span>
          ) : rows.length === 0 ? (
            <span className="italic text-muted-foreground">
              нет позиций для проверки
            </span>
          ) : hasShortage ? (
            <Badge
              variant="outline"
              className="border-red-300 bg-red-100 text-red-900"
            >
              <AlertTriangle className="mr-1 h-3 w-3" />
              Недостаточно товара для отгрузки
            </Badge>
          ) : allOk ? (
            <Badge
              variant="outline"
              className="border-green-300 bg-green-100 text-green-900"
            >
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Товар готов к отгрузке
            </Badge>
          ) : null}
        </div>
      </div>

      {orderIds.length === 0 ? (
        <div className="p-4 text-sm italic text-muted-foreground">
          В заявке пока нет заказов
        </div>
      ) : isLoading ? (
        <div className="p-4 text-sm text-muted-foreground">Загрузка…</div>
      ) : rows.length === 0 ? (
        <div className="p-4 text-sm italic text-muted-foreground">
          В заказах заявки пока нет позиций
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Товар</TableHead>
              <TableHead className="text-right">Нужно загрузить</TableHead>
              <TableHead className="text-right">На складе</TableHead>
              <TableHead className="text-right">Дефицит</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="text-right">Действие</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.key}>
                <TableCell className="font-medium">{r.nomenclature}</TableCell>
                <TableCell className="text-right">
                  {fmt(r.qty)} {r.unit ?? ""}
                </TableCell>
                <TableCell className="text-right">
                  {!warehouseId ? (
                    <span className="text-xs italic text-muted-foreground">
                      —
                    </span>
                  ) : !r.hasProduct ? (
                    <span className="text-xs italic text-muted-foreground">
                      нет в каталоге
                    </span>
                  ) : (
                    fmt(r.av ?? 0)
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {r.enough === false ? (
                    <span className="font-mono font-semibold text-red-700">
                      {fmt(r.deficit)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {r.enough === null ? (
                    <Badge
                      variant="outline"
                      className="border-slate-300 bg-slate-100 text-slate-800"
                    >
                      Не определено
                    </Badge>
                  ) : r.enough ? (
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
                      Не хватает
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {r.enough === false && r.product_id ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={createSupply.isPending}
                      onClick={() =>
                        createSupply.mutate({
                          product_id: r.product_id!,
                          qty: r.deficit,
                          nomenclature: r.nomenclature,
                        })
                      }
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      <PackageSearch className="mr-1 h-3.5 w-3.5" />
                      Создать заявку на пополнение
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
