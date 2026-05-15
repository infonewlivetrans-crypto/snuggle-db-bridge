import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { fetchListViaApi, apiPost } from "@/lib/api-client";

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
 * Все мутации/чтения через серверные endpoint'ы (/api/*).
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

  // Точки заявки → order_id
  const { data: pts = [] } = useQuery({
    queryKey: ["reserv-points", requestId],
    queryFn: async () => {
      const { rows } = await fetchListViaApi<Pt>("/api/route-points", {
        extra: { route_id: requestId },
        limit: 1000,
      });
      return rows;
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
      const { rows } = await fetchListViaApi<Item>("/api/order-items", {
        extra: { order_id: orderIds.join(",") },
        limit: 1000,
      });
      return rows;
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
      if (!it.product_id) continue;
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

  // Активные резервы по этой заявке
  const { data: reservations = [] } = useQuery({
    queryKey: ["reservations", requestId],
    queryFn: async () => {
      const { rows } = await fetchListViaApi<Reserv>("/api/stock-reservations", {
        extra: { transport_request_id: requestId, status: "active" },
        limit: 1000,
      });
      return rows;
    },
  });

  const reservedByProduct = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of reservations) {
      m.set(r.product_id, (m.get(r.product_id) ?? 0) + (Number(r.qty) || 0));
    }
    return m;
  }, [reservations]);

  // Остатки на складе
  const { data: balances = [] } = useQuery({
    queryKey: ["reserv-bal", warehouseId, productIds.join(",")],
    enabled: !!warehouseId && productIds.length > 0,
    queryFn: async () => {
      const { rows } = await fetchListViaApi<Bal>("/api/stock-balances", {
        extra: {
          warehouse_id: warehouseId!,
          product_id: productIds.join(","),
        },
        limit: 1000,
      });
      return rows;
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
    qc.invalidateQueries({ queryKey: ["stock-check-own-reserv"] });
    qc.invalidateQueries({ queryKey: ["stock_balances"] });
    qc.invalidateQueries({ queryKey: ["stock-balances"] });
    qc.invalidateQueries({ queryKey: ["request-wh-status"] });
  };

  const reserveOne = useMutation({
    mutationFn: async (args: {
      product_id: string;
      qty: number;
      nomenclature: string;
    }) => {
      if (!warehouseId) throw new Error("Не указан склад отгрузки");
      if (args.qty <= 0) throw new Error("Нечего резервировать");
      await apiPost("/api/stock-reservations/reserve", {
        request_id: requestId,
        warehouse_id: warehouseId,
        product_id: args.product_id,
        qty: args.qty,
        nomenclature: args.nomenclature,
        route_number: routeNumber ?? null,
      });
    },
    onSuccess: () => {
      toast.success("Товар зарезервирован");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const releaseOne = useMutation({
    mutationFn: async (args: { product_id: string; nomenclature: string }) => {
      if (!warehouseId) throw new Error("Не указан склад");
      await apiPost("/api/stock-reservations/release", {
        request_id: requestId,
        warehouse_id: warehouseId,
        product_id: args.product_id,
        nomenclature: args.nomenclature,
        route_number: routeNumber ?? null,
      });
    },
    onSuccess: () => {
      toast.success("Резерв снят");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reserveAll = useMutation({
    mutationFn: async () => {
      if (!warehouseId) throw new Error("Не указан склад отгрузки");
      const targets = rows.filter((r) => r.canReserveMore > 0);
      if (targets.length === 0) throw new Error("Нечего резервировать");
      let anyShortage = false;
      for (const r of targets) {
        if (r.canReserveMore < r.need) anyShortage = true;
        await apiPost("/api/stock-reservations/reserve", {
          request_id: requestId,
          warehouse_id: warehouseId,
          product_id: r.product_id!,
          qty: r.canReserveMore,
          nomenclature: r.nomenclature,
          route_number: routeNumber ?? null,
        });
      }
      return { anyShortage };
    },
    onSuccess: ({ anyShortage }) => {
      if (anyShortage) {
        toast.warning(
          "Часть товара зарезервирована, по некоторым позициям не хватает остатка",
        );
      } else {
        toast.success("Товар зарезервирован");
      }
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const releaseAll = useMutation({
    mutationFn: async () => {
      if (!warehouseId) throw new Error("Не указан склад");
      await apiPost("/api/stock-reservations/release", {
        request_id: requestId,
        warehouse_id: warehouseId,
        route_number: routeNumber ?? null,
      });
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
