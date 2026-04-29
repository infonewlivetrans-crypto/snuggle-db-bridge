import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Складской статус заявки на транспорт — производное значение,
 * вычисляется из заказов / резервов / остатков / событий на доке.
 *
 * Не хранится в БД, чтобы не дублировать данные и не расходиться с реальностью.
 */
export type RequestWarehouseStatus =
  | "awaiting_check" // Ожидает проверки склада
  | "shortage" // Не хватает товара
  | "reserved" // Товар зарезервирован (но план загрузки ещё не подтверждён)
  | "ready" // Готово к отгрузке
  | "loading" // Загрузка начата
  | "loaded" // Загружено
  | "shipped"; // Отгружено со склада

export const REQ_WH_STATUS_LABELS: Record<RequestWarehouseStatus, string> = {
  awaiting_check: "Ожидает проверки склада",
  shortage: "Не хватает товара",
  reserved: "Товар зарезервирован",
  ready: "Готово к отгрузке",
  loading: "Загрузка начата",
  loaded: "Загружено",
  shipped: "Отгружено со склада",
};

export const REQ_WH_STATUS_STYLES: Record<RequestWarehouseStatus, string> = {
  awaiting_check: "bg-secondary text-foreground border-border",
  shortage: "bg-red-100 text-red-900 border-red-200",
  reserved: "bg-blue-100 text-blue-900 border-blue-200",
  ready: "bg-green-100 text-green-900 border-green-200",
  loading: "bg-amber-100 text-amber-900 border-amber-200",
  loaded: "bg-indigo-100 text-indigo-900 border-indigo-200",
  shipped: "bg-emerald-100 text-emerald-900 border-emerald-200",
};

/**
 * Заявка считается «готовой к отгрузке» (можно выдать маршрут) для статусов,
 * следующих после полной готовности склада.
 */
export const REQ_WH_STATUS_OK_FOR_DRIVER: RequestWarehouseStatus[] = [
  "ready",
  "loading",
  "loaded",
  "shipped",
];

type Pt = { order_id: string };
type Item = {
  product_id: string | null;
  nomenclature: string;
  qty: number;
};
type Reserv = { product_id: string; qty: number };
type Bal = { product_id: string; available: number };
type DRoute = { id: string };
type DockEv = {
  status: string;
  load_plan_confirmed_at: string | null;
  loaded_at: string | null;
  departed_at: string | null;
};
type LoadedRow = { product_id: string | null; qty_loaded: number };

export function useRequestWarehouseStatus(
  requestId: string | null | undefined,
  warehouseId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["request-wh-status", requestId, warehouseId],
    enabled: !!requestId,
    queryFn: async (): Promise<{
      status: RequestWarehouseStatus;
      requiredCount: number;
      reservedFully: boolean;
      anyShortage: boolean;
    }> => {
      // 1. Точки → заказы
      const { data: pts } = await supabase
        .from("route_points")
        .select("order_id")
        .eq("route_id", requestId!);
      const orderIds = Array.from(
        new Set(((pts ?? []) as Pt[]).map((p) => p.order_id).filter(Boolean)),
      );

      let items: Item[] = [];
      if (orderIds.length > 0) {
        const { data } = await supabase
          .from("order_items")
          .select("product_id, nomenclature, qty")
          .in("order_id", orderIds);
        items = (data ?? []) as Item[];
      }

      // Агрегируем требуемое по продукту
      const required = new Map<string, number>();
      for (const it of items) {
        if (!it.product_id) continue;
        required.set(
          it.product_id,
          (required.get(it.product_id) ?? 0) + (Number(it.qty) || 0),
        );
      }

      // 2. Активные резервы по этой заявке
      const { data: reservs } = await supabase
        .from("stock_reservations")
        .select("product_id, qty")
        .eq("transport_request_id", requestId!)
        .eq("status", "active");
      const reservedByProduct = new Map<string, number>();
      for (const r of (reservs ?? []) as Reserv[]) {
        reservedByProduct.set(
          r.product_id,
          (reservedByProduct.get(r.product_id) ?? 0) + (Number(r.qty) || 0),
        );
      }

      // 3. Доступные остатки на складе отгрузки
      const productIds = Array.from(required.keys());
      let availByProduct = new Map<string, number>();
      if (warehouseId && productIds.length > 0) {
        const { data: bals } = await supabase
          .from("stock_balances")
          .select("product_id, available")
          .eq("warehouse_id", warehouseId)
          .in("product_id", productIds);
        for (const b of (bals ?? []) as Bal[]) {
          availByProduct.set(b.product_id, Number(b.available) || 0);
        }
      }

      // 4. Маршрут доставки + dock-event
      const { data: drs } = await supabase
        .from("delivery_routes")
        .select("id")
        .eq("source_request_id", requestId!);
      const drIds = ((drs ?? []) as DRoute[]).map((d) => d.id);

      let dockEvents: DockEv[] = [];
      if (drIds.length > 0) {
        const { data: evs } = await supabase
          .from("warehouse_dock_events")
          .select("status, load_plan_confirmed_at, loaded_at, departed_at")
          .in("delivery_route_id", drIds);
        dockEvents = (evs ?? []) as DockEv[];
      }

      // 5. Уже загружено по маршрутам
      let loadedRows: LoadedRow[] = [];
      if (drIds.length > 0) {
        const { data: lr } = await supabase
          .from("dock_loaded_items")
          .select("product_id, qty_loaded")
          .in("delivery_route_id", drIds);
        loadedRows = (lr ?? []) as LoadedRow[];
      }
      const loadedByProduct = new Map<string, number>();
      for (const r of loadedRows) {
        if (!r.product_id) continue;
        loadedByProduct.set(
          r.product_id,
          (loadedByProduct.get(r.product_id) ?? 0) + (Number(r.qty_loaded) || 0),
        );
      }

      // ----- Расчёт статуса -----
      const requiredCount = required.size;

      // Машина уехала?
      const departed = dockEvents.some(
        (e) => e.status === "departed" || !!e.departed_at,
      );
      if (departed) {
        return {
          status: "shipped",
          requiredCount,
          reservedFully: true,
          anyShortage: false,
        };
      }

      // Всё загружено?
      const allLoaded =
        requiredCount > 0 &&
        Array.from(required.entries()).every(([pid, need]) => {
          return (loadedByProduct.get(pid) ?? 0) >= need;
        });
      const dockSaysLoaded = dockEvents.some(
        (e) => e.status === "loaded" || !!e.loaded_at,
      );
      if (allLoaded || dockSaysLoaded) {
        return {
          status: "loaded",
          requiredCount,
          reservedFully: true,
          anyShortage: false,
        };
      }

      // Загрузка начата?
      const someLoaded = loadedRows.some((r) => Number(r.qty_loaded) > 0);
      const dockLoading = dockEvents.some((e) => e.status === "loading");
      if (someLoaded || dockLoading) {
        return {
          status: "loading",
          requiredCount,
          reservedFully: true,
          anyShortage: false,
        };
      }

      if (requiredCount === 0) {
        return {
          status: "awaiting_check",
          requiredCount,
          reservedFully: false,
          anyShortage: false,
        };
      }

      // Полностью зарезервирован?
      let reservedFully = true;
      let anyShortage = false;
      for (const [pid, need] of required) {
        const reserved = reservedByProduct.get(pid) ?? 0;
        if (reserved < need) {
          reservedFully = false;
          const stillNeed = need - reserved;
          const av = availByProduct.get(pid) ?? 0;
          if (av < stillNeed) anyShortage = true;
        }
      }

      // План загрузки подтверждён?
      const planConfirmed = dockEvents.some((e) => !!e.load_plan_confirmed_at);

      if (reservedFully && planConfirmed) {
        return { status: "ready", requiredCount, reservedFully, anyShortage: false };
      }
      if (reservedFully) {
        return { status: "reserved", requiredCount, reservedFully, anyShortage: false };
      }
      if (anyShortage) {
        return { status: "shortage", requiredCount, reservedFully, anyShortage };
      }
      // Есть товар на складе, но ещё не зарезервирован — ждём действий склада
      return {
        status: "awaiting_check",
        requiredCount,
        reservedFully,
        anyShortage,
      };
    },
  });
}

/**
 * Лёгкая версия для списков: считает статус по уже загруженным данным
 * (когда дополнительные запросы делать не хочется).
 * Возвращает null, если данных недостаточно.
 */
export function deriveStatusFromFlags(opts: {
  hasOrders: boolean;
  reservedFully: boolean;
  anyShortage: boolean;
  planConfirmed: boolean;
  loadingStarted: boolean;
  loaded: boolean;
  departed: boolean;
}): RequestWarehouseStatus {
  if (opts.departed) return "shipped";
  if (opts.loaded) return "loaded";
  if (opts.loadingStarted) return "loading";
  if (!opts.hasOrders) return "awaiting_check";
  if (opts.reservedFully && opts.planConfirmed) return "ready";
  if (opts.reservedFully) return "reserved";
  if (opts.anyShortage) return "shortage";
  return "awaiting_check";
}
