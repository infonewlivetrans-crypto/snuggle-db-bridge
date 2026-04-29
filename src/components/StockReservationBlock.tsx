import { useMemo } from "react";
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
  Lock,
  LockOpen,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
} from "lucide-react";
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
type Bal = { product_id: string; available: number };
type Reserv = {
  id: string;
  product_id: string;
  warehouse_id: string;
  qty: number;
  status: string;
  transport_request_id: string | null;
};

function fmt(n: number, digits = 3) {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("ru-RU", { maximumFractionDigits: digits });
}

/**
 * Резервирование товара под заявку на транспорт.
 * - Резерв уменьшает доступный остаток (через view stock_balances).
 * - При снятии — возвращает в доступный.
 * - Все действия фиксируются в журнале движения товара.
 */
export function StockReservationBlock({
  requestId,
  warehouseId,
  routeNumber,
}: {
  requestId: string;
  warehouseId: string | null;
  routeNumber?: string | null;
}) {
  const qc = useQueryClient();

  // Заказы заявки
  const { data: pts = [] } = useQuery({
    queryKey: ["reserv-points", requestId],
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

  // Состав заказов
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["reserv-items", requestId, orderIds.join(",")],
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

  // Агрегация по товару — нужно
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
      if (!it.product_id) continue; // резервируем только каталожные
      const key = it.product_id;
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

  const productIds = required.map((r) => r.product_id!).filter(Boolean);

  // Текущие резервы по этой заявке
  const { data: reservations = [] } = useQuery({
    queryKey: ["reservations", requestId],
    queryFn: async () => {
      const { data, error } = await db
        .from("stock_reservations")
        .select("id, product_id, warehouse_id, qty, status, transport_request_id")
        .eq("transport_request_id", requestId)
        .eq("status", "active");
      if (error) throw error;
      return (data ?? []) as Reserv[];
    },
  });

  const reservedByProduct = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of reservations) {
      m.set(r.product_id, (m.get(r.product_id) ?? 0) + (Number(r.qty) || 0));
    }
    return m;
  }, [reservations]);

  // Остатки на складе (доступно — уже учитывает все резервы)
  const { data: balances = [] } = useQuery({
    queryKey: ["reserv-bal", warehouseId, productIds.join(",")],
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

  const rows = useMemo(
    () =>
      required.map((r) => {
        const reserved = reservedByProduct.get(r.product_id!) ?? 0;
        const need = Math.max(0, r.qty - reserved);
        const available = availByProduct.get(r.product_id!) ?? 0;
        const canReserveMore = Math.min(need, available);
        const fullyReserved = reserved >= r.qty;
        const partially = reserved > 0 && reserved < r.qty;
        const enoughToFinish = available >= need;
        return {
          ...r,
          reserved,
          need,
          available,
          canReserveMore,
          fullyReserved,
          partially,
          enoughToFinish,
        };
      }),
    [required, reservedByProduct, availByProduct],
  );

  // Сводный статус
  const summary = useMemo(() => {
    if (!warehouseId || rows.length === 0) return null;
    const allFull = rows.every((r) => r.fullyReserved);
    const noneReserved = rows.every((r) => r.reserved === 0);
    const anyShortage = rows.some((r) => !r.fullyReserved && !r.enoughToFinish);
    if (allFull) return "full" as const;
    if (anyShortage) return "shortage" as const;
    if (noneReserved) return "none" as const;
    return "partial" as const;
  }, [rows, warehouseId]);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["reservations", requestId] });
    qc.invalidateQueries({ queryKey: ["reserv-bal"] });
    qc.invalidateQueries({ queryKey: ["stock-check-bal"] });
    qc.invalidateQueries({ queryKey: ["stock_balances"] });
  };

  // Резервировать одну строку
  const reserveOne = useMutation({
    mutationFn: async (args: {
      product_id: string;
      qty: number;
      nomenclature: string;
    }) => {
      if (!warehouseId) throw new Error("Не указан склад отгрузки");
      // Свежая проверка остатка
      const { data: bal, error: be } = await db
        .from("stock_balances")
        .select("available")
        .eq("warehouse_id", warehouseId)
        .eq("product_id", args.product_id)
        .maybeSingle();
      if (be) throw be;
      const av = Number(bal?.available ?? 0);
      if (args.qty <= 0) throw new Error("Нечего резервировать");
      if (av < args.qty) {
        throw new Error("Нельзя зарезервировать товар: недостаточно остатка");
      }

      const { error: re } = await db.from("stock_reservations").insert({
        product_id: args.product_id,
        warehouse_id: warehouseId,
        qty: args.qty,
        status: "active",
        transport_request_id: requestId,
        comment: routeNumber
          ? `Резерв под заявку ${routeNumber}`
          : "Резерв под заявку на транспорт",
        created_by: "Логист",
      });
      if (re) throw re;

      const { error: me } = await db.from("stock_movements").insert({
        product_id: args.product_id,
        warehouse_id: warehouseId,
        movement_type: "reserve",
        qty: args.qty,
        reason: "reservation_created",
        ref_route_id: requestId,
        ref_transport_request_id: requestId,
        comment: routeNumber
          ? `Резерв под заявку ${routeNumber}: ${args.nomenclature}`
          : `Резерв: ${args.nomenclature}`,
        created_by: "Логист",
      });
      if (me) throw me;
    },
    onSuccess: () => {
      toast.success("Товар зарезервирован");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Снять резерв по строке (все активные резервы по продукту в этой заявке)
  const releaseOne = useMutation({
    mutationFn: async (args: { product_id: string; nomenclature: string }) => {
      if (!warehouseId) throw new Error("Не указан склад");
      const { data: active, error: qe } = await db
        .from("stock_reservations")
        .select("id, qty")
        .eq("transport_request_id", requestId)
        .eq("product_id", args.product_id)
        .eq("status", "active");
      if (qe) throw qe;
      const list = (active ?? []) as Array<{ id: string; qty: number }>;
      const total = list.reduce((s, r) => s + (Number(r.qty) || 0), 0);
      if (total <= 0) return;

      const ids = list.map((r) => r.id);
      const { error: ue } = await db
        .from("stock_reservations")
        .update({ status: "released" })
        .in("id", ids);
      if (ue) throw ue;

      const { error: me } = await db.from("stock_movements").insert({
        product_id: args.product_id,
        warehouse_id: warehouseId,
        movement_type: "reservation_release",
        qty: total,
        reason: "reservation_released",
        ref_route_id: requestId,
        ref_transport_request_id: requestId,
        comment: routeNumber
          ? `Снятие резерва (заявка ${routeNumber}): ${args.nomenclature}`
          : `Снятие резерва: ${args.nomenclature}`,
        created_by: "Логист",
      });
      if (me) throw me;
    },
    onSuccess: () => {
      toast.success("Резерв снят");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Зарезервировать всё, что можно
  const reserveAll = useMutation({
    mutationFn: async () => {
      if (!warehouseId) throw new Error("Не указан склад отгрузки");
      const targets = rows.filter((r) => r.canReserveMore > 0);
      if (targets.length === 0) {
        throw new Error("Нечего резервировать");
      }
      let anyShortage = false;
      for (const r of targets) {
        if (r.canReserveMore < r.need) anyShortage = true;
        const { error: re } = await db.from("stock_reservations").insert({
          product_id: r.product_id!,
          warehouse_id: warehouseId,
          qty: r.canReserveMore,
          status: "active",
          transport_request_id: requestId,
          comment: routeNumber
            ? `Резерв под заявку ${routeNumber}`
            : "Резерв под заявку на транспорт",
          created_by: "Логист",
        });
        if (re) throw re;
        const { error: me } = await db.from("stock_movements").insert({
          product_id: r.product_id!,
          warehouse_id: warehouseId,
          movement_type: "reserve",
          qty: r.canReserveMore,
          reason: "reservation_created",
          ref_route_id: requestId,
          ref_transport_request_id: requestId,
          comment: routeNumber
            ? `Резерв под заявку ${routeNumber}: ${r.nomenclature}`
            : `Резерв: ${r.nomenclature}`,
          created_by: "Логист",
        });
        if (me) throw me;
      }
      return { anyShortage };
    },
    onSuccess: ({ anyShortage }) => {
      if (anyShortage) {
        toast.warning("Часть товара зарезервирована, по некоторым позициям не хватает остатка");
      } else {
        toast.success("Товар зарезервирован");
      }
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Снять все резервы по заявке
  const releaseAll = useMutation({
    mutationFn: async () => {
      if (!warehouseId) throw new Error("Не указан склад");
      const { data: active, error: qe } = await db
        .from("stock_reservations")
        .select("id, product_id, qty")
        .eq("transport_request_id", requestId)
        .eq("status", "active");
      if (qe) throw qe;
      if (!active || active.length === 0) return;

      const ids = active.map((r) => r.id);
      const { error: ue } = await db
        .from("stock_reservations")
        .update({ status: "released" })
        .in("id", ids);
      if (ue) throw ue;

      // Группируем по product_id для журнала
      const byProduct = new Map<string, number>();
      for (const r of active) {
        byProduct.set(
          r.product_id,
          (byProduct.get(r.product_id) ?? 0) + (Number(r.qty) || 0),
        );
      }
      for (const [pid, total] of byProduct) {
        const nomenc =
          rows.find((x) => x.product_id === pid)?.nomenclature ?? "";
        const { error: me } = await db.from("stock_movements").insert({
          product_id: pid,
          warehouse_id: warehouseId,
          movement_type: "reservation_release",
          qty: total,
          reason: "reservation_released",
          ref_route_id: requestId,
          ref_transport_request_id: requestId,
          comment: routeNumber
            ? `Снятие резерва (заявка ${routeNumber})${nomenc ? ": " + nomenc : ""}`
            : `Снятие резерва${nomenc ? ": " + nomenc : ""}`,
          created_by: "Логист",
        });
        if (me) throw me;
      }
    },
    onSuccess: () => {
      toast.success("Резерв снят по всем позициям");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hasAnyReserved = reservations.length > 0;
  const canReserveAny = rows.some((r) => r.canReserveMore > 0);

  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Lock className="h-4 w-4" />
          Резервирование товара
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {summary === "full" && (
            <Badge
              variant="outline"
              className="border-green-300 bg-green-100 text-green-900"
            >
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Зарезервировано
            </Badge>
          )}
          {summary === "partial" && (
            <Badge
              variant="outline"
              className="border-amber-300 bg-amber-100 text-amber-900"
            >
              Частично зарезервировано
            </Badge>
          )}
          {summary === "shortage" && (
            <Badge
              variant="outline"
              className="border-red-300 bg-red-100 text-red-900"
            >
              <AlertTriangle className="mr-1 h-3 w-3" />
              Недостаточно товара
            </Badge>
          )}
          {summary === "none" && (
            <Badge
              variant="outline"
              className="border-slate-300 bg-slate-100 text-slate-800"
            >
              <CircleDashed className="mr-1 h-3 w-3" />
              Не зарезервировано
            </Badge>
          )}

          <Button
            size="sm"
            variant="default"
            disabled={
              !warehouseId ||
              rows.length === 0 ||
              !canReserveAny ||
              reserveAll.isPending
            }
            onClick={() => reserveAll.mutate()}
          >
            <Lock className="mr-1 h-3.5 w-3.5" />
            Зарезервировать товар
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!hasAnyReserved || releaseAll.isPending}
            onClick={() => releaseAll.mutate()}
          >
            <LockOpen className="mr-1 h-3.5 w-3.5" />
            Снять резерв
          </Button>
        </div>
      </div>

      {!warehouseId ? (
        <div className="p-4 text-sm italic text-muted-foreground">
          Склад отгрузки не указан
        </div>
      ) : orderIds.length === 0 ? (
        <div className="p-4 text-sm italic text-muted-foreground">
          В заявке пока нет заказов
        </div>
      ) : isLoading ? (
        <div className="p-4 text-sm text-muted-foreground">Загрузка…</div>
      ) : rows.length === 0 ? (
        <div className="p-4 text-sm italic text-muted-foreground">
          Нет каталожных позиций для резервирования
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Товар</TableHead>
              <TableHead className="text-right">Нужно</TableHead>
              <TableHead className="text-right">Зарезервировано</TableHead>
              <TableHead className="text-right">Доступно</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="text-right">Действие</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              let badge: React.ReactNode;
              if (r.fullyReserved) {
                badge = (
                  <Badge
                    variant="outline"
                    className="border-green-300 bg-green-100 text-green-900"
                  >
                    Зарезервировано
                  </Badge>
                );
              } else if (r.partially) {
                badge = (
                  <Badge
                    variant="outline"
                    className="border-amber-300 bg-amber-100 text-amber-900"
                  >
                    Частично
                  </Badge>
                );
              } else if (!r.enoughToFinish) {
                badge = (
                  <Badge
                    variant="outline"
                    className="border-red-300 bg-red-100 text-red-900"
                  >
                    <AlertTriangle className="mr-1 h-3 w-3" />
                    Недостаточно
                  </Badge>
                );
              } else {
                badge = (
                  <Badge
                    variant="outline"
                    className="border-slate-300 bg-slate-100 text-slate-800"
                  >
                    Не зарезервировано
                  </Badge>
                );
              }

              return (
                <TableRow key={r.key}>
                  <TableCell className="font-medium">{r.nomenclature}</TableCell>
                  <TableCell className="text-right">
                    {fmt(r.qty)} {r.unit ?? ""}
                  </TableCell>
                  <TableCell className="text-right">
                    {fmt(r.reserved)}
                  </TableCell>
                  <TableCell className="text-right">{fmt(r.available)}</TableCell>
                  <TableCell>{badge}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {!r.fullyReserved && r.canReserveMore > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reserveOne.isPending}
                          onClick={() =>
                            reserveOne.mutate({
                              product_id: r.product_id!,
                              qty: r.canReserveMore,
                              nomenclature: r.nomenclature,
                            })
                          }
                        >
                          <Lock className="mr-1 h-3.5 w-3.5" />
                          Зарезервировать
                        </Button>
                      )}
                      {r.reserved > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={releaseOne.isPending}
                          onClick={() =>
                            releaseOne.mutate({
                              product_id: r.product_id!,
                              nomenclature: r.nomenclature,
                            })
                          }
                        >
                          <LockOpen className="mr-1 h-3.5 w-3.5" />
                          Снять
                        </Button>
                      )}
                    </div>
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
