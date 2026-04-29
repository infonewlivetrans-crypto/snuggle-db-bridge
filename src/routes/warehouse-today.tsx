import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Truck, Package, RotateCcw, Warehouse as WhIcon, Calendar, MessageSquare, ImageIcon, ClipboardCheck, Info, CheckCircle2, Clock, AlertTriangle, Timer } from "lucide-react";
import { DockLoadingChecklistBlock } from "@/components/DockLoadingChecklistBlock";
import { RequestWarehouseStatusBadge } from "@/components/RequestWarehouseStatusBadge";

/** Тикающие "часы" (обновляются каждые 30 секунд) для пересчёта таймеров */
function useNowTick(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

type EtaInfo = {
  minutes: number; // положительные — впереди, отрицательные — опоздание
  label: string;
  isSoon: boolean; // < 60 минут
  isLate: boolean; // время прошло
};

function computeEta(target: Date | null, now: Date): EtaInfo | null {
  if (!target) return null;
  const diffMs = target.getTime() - now.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes >= 0) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const label = h > 0 ? `через ${h} ч ${m} мин` : `через ${m} мин`;
    return { minutes, label, isSoon: minutes < 60, isLate: false };
  }
  const lateMin = Math.abs(minutes);
  const h = Math.floor(lateMin / 60);
  const m = lateMin % 60;
  const label = h > 0 ? `опоздание ${h} ч ${m} мин` : `опоздание ${m} мин`;
  return { minutes, label, isSoon: false, isLate: true };
}

function fmtTime(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

const CARGO_POSITIONS: { value: string; label: string }[] = [
  { value: "side", label: "У борта" },
  { value: "top", label: "Сверху" },
  { value: "bottom", label: "Снизу" },
  { value: "deep", label: "В глубине кузова" },
  { value: "left", label: "Слева" },
  { value: "right", label: "Справа" },
  { value: "return_trip", label: "На обратный путь" },
];

export const Route = createFileRoute("/warehouse-today")({
  head: () => ({
    meta: [
      { title: "Склад сегодня — Радиус Трек" },
      { name: "description", content: "Машины на складе: отгрузки и возвраты на сегодня." },
    ],
  }),
  component: WarehouseTodayPage,
});

type DockStatus =
  | "expected"
  | "arrived"
  | "loading"
  | "loaded"
  | "departed"
  | "return_expected"
  | "return_accepted";

const STATUS_LABELS: Record<DockStatus, string> = {
  expected: "Ожидается",
  arrived: "Прибыла",
  loading: "Загрузка",
  loaded: "Загружена",
  departed: "Уехала",
  return_expected: "Возврат ожидается",
  return_accepted: "Возврат принят",
};

const STATUS_STYLES: Record<DockStatus, string> = {
  expected: "bg-secondary text-foreground border-border",
  arrived: "bg-blue-100 text-blue-900 border-blue-200",
  loading: "bg-amber-100 text-amber-900 border-amber-200",
  loaded: "bg-indigo-100 text-indigo-900 border-indigo-200",
  departed: "bg-emerald-100 text-emerald-900 border-emerald-200",
  return_expected: "bg-orange-100 text-orange-900 border-orange-200",
  return_accepted: "bg-purple-100 text-purple-900 border-purple-200",
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type DockEvent = {
  id: string;
  delivery_route_id: string | null;
  warehouse_id: string | null;
  event_date: string;
  expected_at: string | null;
  status: DockStatus;
  driver_name: string | null;
  vehicle_plate: string | null;
  route_number: string | null;
  comment: string | null;
  arrived_at: string | null;
  loading_started_at: string | null;
  loaded_at: string | null;
  departed_at: string | null;
  return_accepted_at: string | null;
  load_plan_confirmed_at: string | null;
  load_plan_confirmed_by: string | null;
};

function WarehouseTodayPage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayStr());
  const [openCard, setOpenCard] = useState<string | null>(null);

  // Маршруты на сегодня (на основе delivery_routes)
  const { data: routes } = useQuery({
    queryKey: ["wh-today-routes", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_routes")
        .select("id, route_number, route_date, status, assigned_driver, assigned_vehicle, source_warehouse_id, source_request_id, comment, created_at")
        .eq("route_date", date)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // События склада (ручные статусы машин)
  const { data: events } = useQuery({
    queryKey: ["wh-today-events", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouse_dock_events")
        .select("*")
        .eq("event_date", date)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DockEvent[];
    },
  });

  // Точки маршрутов с возвратами на склад (по dp_status / status)
  const routeIds = useMemo(() => (routes ?? []).map((r) => r.id), [routes]);
  const { data: returnPoints } = useQuery({
    queryKey: ["wh-today-returns", routeIds],
    enabled: routeIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("route_points")
        .select("id, route_id, order_id, status, dp_status, dp_return_comment, dp_expected_return_at, dp_return_warehouse_id, completed_at")
        .in("route_id", routeIds)
        .or("status.eq.returned_to_warehouse,dp_status.eq.return_to_warehouse");
      if (error) throw error;
      return data ?? [];
    },
  });

  const orderIds = useMemo(() => (returnPoints ?? []).map((p) => p.order_id), [returnPoints]);
  const { data: returnOrders } = useQuery({
    queryKey: ["wh-today-return-orders", orderIds],
    enabled: orderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, delivery_address, contact_name, contact_phone, comment")
        .in("id", orderIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const pointIds = useMemo(() => (returnPoints ?? []).map((p) => p.id), [returnPoints]);
  const { data: returnPhotos } = useQuery({
    queryKey: ["wh-today-return-photos", pointIds],
    enabled: pointIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("route_point_photos")
        .select("id, route_point_id, file_url, kind")
        .in("route_point_id", pointIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const eventByRoute = useMemo(() => {
    const m = new Map<string, DockEvent>();
    (events ?? []).forEach((e) => {
      if (e.delivery_route_id) m.set(e.delivery_route_id, e);
    });
    return m;
  }, [events]);

  // Получаем заказы маршрута для карточки
  const { data: routePoints } = useQuery({
    queryKey: ["wh-today-route-points", routeIds],
    enabled: routeIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("route_points")
        .select("id, route_id, order_id, point_number, status")
        .in("route_id", routeIds)
        .order("point_number", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const allOrderIds = useMemo(
    () => Array.from(new Set((routePoints ?? []).map((p) => p.order_id))),
    [routePoints],
  );
  const { data: allOrders } = useQuery({
    queryKey: ["wh-today-all-orders", allOrderIds],
    enabled: allOrderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, delivery_address, contact_name, total_weight_kg, items_count, comment")
        .in("id", allOrderIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const upsertStatus = useMutation({
    mutationFn: async (args: { route: typeof routes extends (infer T)[] | undefined ? T : never; status: DockStatus }) => {
      const r = args.route;
      const existing = eventByRoute.get(r.id);
      const now = new Date().toISOString();
      const patch: Partial<DockEvent> = {
        status: args.status,
        delivery_route_id: r.id,
        warehouse_id: r.source_warehouse_id,
        event_date: date,
        route_number: r.route_number,
        driver_name: r.assigned_driver,
        vehicle_plate: r.assigned_vehicle,
      };
      if (args.status === "arrived") patch.arrived_at = now;
      if (args.status === "loading") patch.loading_started_at = now;
      if (args.status === "loaded") patch.loaded_at = now;
      if (args.status === "departed") patch.departed_at = now;
      if (args.status === "return_accepted") patch.return_accepted_at = now;

      if (existing) {
        const { error } = await supabase.from("warehouse_dock_events").update(patch).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("warehouse_dock_events").insert(patch);
        if (error) throw error;
      }

      // Если приняли возврат — синхронизируем точки маршрута, чтобы событие попало в отчёт склада
      if (args.status === "return_accepted") {
        const pts = (returnPoints ?? []).filter((p) => p.route_id === r.id);
        if (pts.length > 0) {
          const ids = pts.map((p) => p.id);
          const { error } = await supabase
            .from("route_points")
            .update({
              wh_return_status: "accepted",
              wh_return_arrived_at: now,
              wh_return_accepted_at: now,
              wh_return_accepted_by: "Кладовщик",
              wh_return_status_changed_at: now,
              wh_return_status_changed_by: "Кладовщик",
            })
            .in("id", ids);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wh-today-events", date] });
      qc.invalidateQueries({ queryKey: ["wh-today-returns"] });
      qc.invalidateQueries({ queryKey: ["wh-returns"] });
      qc.invalidateQueries({ queryKey: ["request-wh-status"] });
      toast.success("Статус обновлён");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Группируем возвраты по маршруту для подсветки
  const returnsByRoute = useMemo(() => {
    const m = new Map<string, typeof returnPoints>();
    (returnPoints ?? []).forEach((p) => {
      const arr = m.get(p.route_id) ?? [];
      arr.push(p);
      m.set(p.route_id, arr);
    });
    return m;
  }, [returnPoints]);

  const ordersByRoute = useMemo(() => {
    const m = new Map<string, { pointId: string; orderId: string; pointNumber: number; status: string }[]>();
    (routePoints ?? []).forEach((p) => {
      const arr = m.get(p.route_id) ?? [];
      arr.push({ pointId: p.id, orderId: p.order_id, pointNumber: p.point_number, status: p.status });
      m.set(p.route_id, arr);
    });
    return m;
  }, [routePoints]);

  // План загрузки по точкам открытого маршрута
  const openedPointIds = useMemo(
    () =>
      openCard ? (routePoints ?? []).filter((p) => p.route_id === openCard).map((p) => p.id) : [],
    [openCard, routePoints],
  );
  const { data: loadPlan } = useQuery({
    queryKey: ["wh-load-plan", openCard, openedPointIds],
    enabled: !!openCard && openedPointIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouse_load_plan")
        .select("*")
        .in("route_point_id", openedPointIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  const loadPlanByPoint = useMemo(() => {
    const m = new Map<string, { id: string; cargo_position: string | null; warehouse_comment: string | null }>();
    (loadPlan ?? []).forEach((lp) => m.set(lp.route_point_id, lp));
    return m;
  }, [loadPlan]);

  const upsertLoadPlan = useMutation({
    mutationFn: async (args: {
      pointId: string;
      routeId: string;
      cargo_position?: string | null;
      warehouse_comment?: string | null;
    }) => {
      const existing = loadPlanByPoint.get(args.pointId);
      const patch: {
        route_point_id: string;
        delivery_route_id: string;
        cargo_position?: string | null;
        warehouse_comment?: string | null;
      } = {
        route_point_id: args.pointId,
        delivery_route_id: args.routeId,
      };
      if (args.cargo_position !== undefined) patch.cargo_position = args.cargo_position;
      if (args.warehouse_comment !== undefined) patch.warehouse_comment = args.warehouse_comment;
      if (existing) {
        const { error } = await supabase
          .from("warehouse_load_plan")
          .update(patch)
          .eq("route_point_id", args.pointId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("warehouse_load_plan").insert(patch);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wh-load-plan", openCard] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmLoadPlan = useMutation({
    mutationFn: async () => {
      if (!openedRoute) return;
      const now = new Date().toISOString();
      const existing = eventByRoute.get(openedRoute.id);
      if (existing) {
        const { error } = await supabase
          .from("warehouse_dock_events")
          .update({ load_plan_confirmed_at: now })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("warehouse_dock_events").insert({
          delivery_route_id: openedRoute.id,
          warehouse_id: openedRoute.source_warehouse_id,
          event_date: date,
          route_number: openedRoute.route_number,
          driver_name: openedRoute.assigned_driver,
          vehicle_plate: openedRoute.assigned_vehicle,
          load_plan_confirmed_at: now,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wh-today-events", date] });
      toast.success("План загрузки подтверждён");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const orderById = useMemo(() => {
    const m = new Map<string, NonNullable<typeof allOrders>[number]>();
    (allOrders ?? []).forEach((o) => m.set(o.id, o));
    return m;
  }, [allOrders]);

  const returnOrderById = useMemo(() => {
    const m = new Map<string, NonNullable<typeof returnOrders>[number]>();
    (returnOrders ?? []).forEach((o) => m.set(o.id, o));
    return m;
  }, [returnOrders]);

  const photosByPoint = useMemo(() => {
    const m = new Map<string, { id: string; file_url: string; kind: string }[]>();
    (returnPhotos ?? []).forEach((ph) => {
      const arr = m.get(ph.route_point_id) ?? [];
      arr.push(ph);
      m.set(ph.route_point_id, arr);
    });
    return m;
  }, [returnPhotos]);

  const openedRoute = (routes ?? []).find((r) => r.id === openCard) ?? null;
  const openedEvent = openCard ? eventByRoute.get(openCard) : undefined;
  const openedReturns = openCard ? returnsByRoute.get(openCard) ?? [] : [];
  const openedOrders = openCard ? ordersByRoute.get(openCard) ?? [] : [];

  // === Таймеры ===
  const now = useNowTick(30_000);

  // Сохранение ожидаемого времени отгрузки/прибытия машины
  const setExpectedAt = useMutation({
    mutationFn: async (args: { route: NonNullable<typeof routes>[number]; isoTime: string | null }) => {
      const existing = eventByRoute.get(args.route.id);
      const patch = {
        delivery_route_id: args.route.id,
        warehouse_id: args.route.source_warehouse_id,
        event_date: date,
        route_number: args.route.route_number,
        driver_name: args.route.assigned_driver,
        vehicle_plate: args.route.assigned_vehicle,
        expected_at: args.isoTime,
      };
      if (existing) {
        const { error } = await supabase
          .from("warehouse_dock_events")
          .update({ expected_at: args.isoTime })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("warehouse_dock_events").insert(patch);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wh-today-events", date] }),
    onError: (e: Error) => toast.error(e.message),
  });

  // Ближайшая ожидаемая/прибывающая машина
  const nextVehicle = useMemo(() => {
    const list = (routes ?? [])
      .map((r) => {
        const ev = eventByRoute.get(r.id);
        const status: DockStatus = ev?.status ?? "expected";
        const expected = ev?.expected_at ? new Date(ev.expected_at) : null;
        return { route: r, ev, status, expected };
      })
      .filter((x) => x.expected && (x.status === "expected" || x.status === "arrived" || x.status === "loading"))
      .sort((a, b) => (a.expected!.getTime() - b.expected!.getTime()));
    return list[0] ?? null;
  }, [routes, eventByRoute]);


  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Склад сегодня
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Машины на отгрузку и возвраты по маршрутам
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-[160px]" />
          </div>
        </div>

        {/* Блок "Ближайшая машина" */}
        {nextVehicle && nextVehicle.expected && (() => {
          const eta = computeEta(nextVehicle.expected, now);
          const cargoCount = ordersByRoute.get(nextVehicle.route.id)?.length ?? 0;
          const tone = eta?.isLate
            ? "border-destructive/40 bg-destructive/5"
            : eta?.isSoon
              ? "border-amber-300 bg-amber-50 dark:bg-amber-900/10"
              : "border-blue-200 bg-blue-50 dark:bg-blue-900/10";
          return (
            <div className={`mb-4 rounded-lg border p-4 ${tone}`}>
              <div className="mb-2 inline-flex items-center gap-2 text-sm font-semibold">
                <Timer className="h-4 w-4" /> Ближайшая машина
              </div>
              <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div>👤 Водитель: <span className="font-medium">{nextVehicle.route.assigned_driver ?? "—"}</span></div>
                <div>🚚 Машина: <span className="font-medium">{nextVehicle.route.assigned_vehicle ?? "—"}</span></div>
                <div>🧭 Маршрут: <span className="font-medium">№{nextVehicle.route.route_number}</span></div>
                <div>🕒 Время: <span className="font-medium">{fmtTime(nextVehicle.expected)}</span></div>
                <div className={eta?.isLate ? "text-destructive font-semibold" : eta?.isSoon ? "text-amber-700 font-semibold dark:text-amber-300" : ""}>
                  ⏳ {eta?.label ?? "—"}
                </div>
                <div>📦 К загрузке: <span className="font-medium">{cargoCount} точ.</span></div>
              </div>
              {eta?.isLate && nextVehicle.status !== "arrived" && (
                <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" /> Машина опаздывает
                </div>
              )}
              {eta?.isSoon && !eta.isLate && (
                <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
                  <AlertTriangle className="h-3.5 w-3.5" /> Машина прибудет через {eta.minutes} мин
                </div>
              )}
            </div>
          );
        })()}

        {(routes?.length ?? 0) === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card py-12 text-center">
            <Truck className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">На эту дату маршрутов нет</div>
          </div>
        ) : (
          <div className="space-y-3">
            {routes!.map((r) => {
              const ev = eventByRoute.get(r.id);
              const status: DockStatus = ev?.status ?? "expected";
              const hasReturns = (returnsByRoute.get(r.id)?.length ?? 0) > 0;
              const expected = ev?.expected_at ? new Date(ev.expected_at) : null;
              const eta = computeEta(expected, now);
              const showSoon = eta?.isSoon && !eta.isLate;
              const showLate = eta?.isLate && status !== "arrived" && status !== "loading" && status !== "loaded" && status !== "departed";
              const returns = returnsByRoute.get(r.id) ?? [];
              const nextReturn = returns
                .map((rp) => (rp.dp_expected_return_at ? new Date(rp.dp_expected_return_at) : null))
                .filter((d): d is Date => !!d)
                .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
              const returnEta = computeEta(nextReturn, now);
              // Значение для time input (HH:MM по локали)
              const timeInputValue = expected
                ? `${String(expected.getHours()).padStart(2, "0")}:${String(expected.getMinutes()).padStart(2, "0")}`
                : "";
              return (
                <div key={r.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">Маршрут №{r.route_number}</span>
                        <Badge variant="outline" className={STATUS_STYLES[status]}>
                          {STATUS_LABELS[status]}
                        </Badge>
                        {r.source_request_id && (
                          <RequestWarehouseStatusBadge
                            requestId={r.source_request_id}
                            warehouseId={r.source_warehouse_id}
                          />
                        )}
                        {hasReturns && (
                          <Badge variant="outline" className="bg-orange-100 text-orange-900 border-orange-200">
                            <RotateCcw className="mr-1 h-3 w-3" />
                            Ожидается возврат
                          </Badge>
                        )}
                        {showLate && (
                          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            Машина опаздывает
                          </Badge>
                        )}
                        {showSoon && (
                          <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-200">
                            <Clock className="mr-1 h-3 w-3" />
                            Машина прибудет через {eta!.minutes} мин
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1.5 grid grid-cols-1 gap-1 text-sm text-muted-foreground sm:grid-cols-3">
                        <div>👤 {r.assigned_driver ?? "Водитель не назначен"}</div>
                        <div>🚚 {r.assigned_vehicle ?? "Машина не назначена"}</div>
                        <div>📦 Точек: {ordersByRoute.get(r.id)?.length ?? 0}</div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                        <div className="inline-flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Прибытие/отгрузка:</span>
                          <Input
                            type="time"
                            value={timeInputValue}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (!v) {
                                setExpectedAt.mutate({ route: r, isoTime: null });
                                return;
                              }
                              const [hh, mm] = v.split(":").map(Number);
                              const dt = new Date(date + "T00:00:00");
                              dt.setHours(hh, mm, 0, 0);
                              setExpectedAt.mutate({ route: r, isoTime: dt.toISOString() });
                            }}
                            className="h-7 w-[110px]"
                          />
                        </div>
                        {eta && (
                          <span
                            className={
                              eta.isLate
                                ? "font-semibold text-destructive"
                                : eta.isSoon
                                  ? "font-semibold text-amber-700 dark:text-amber-300"
                                  : "text-muted-foreground"
                            }
                          >
                            ⏳ {eta.label}
                          </span>
                        )}
                        {returnEta && (
                          <span className="inline-flex items-center gap-1 text-xs text-orange-700 dark:text-orange-300">
                            <RotateCcw className="h-3 w-3" />
                            Ожидается возврат {returnEta.isLate ? `(опоздание ${Math.abs(returnEta.minutes)} мин)` : `через ${returnEta.minutes} мин`}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => setOpenCard(r.id)}>
                        Открыть
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant={status === "arrived" ? "default" : "outline"}
                      onClick={() => upsertStatus.mutate({ route: r, status: "arrived" })}>
                      Машина прибыла
                    </Button>
                    <Button size="sm" variant={status === "loading" ? "default" : "outline"}
                      onClick={() => upsertStatus.mutate({ route: r, status: "loading" })}>
                      Начать загрузку
                    </Button>
                    <Button size="sm" variant={status === "loaded" ? "default" : "outline"}
                      onClick={() => upsertStatus.mutate({ route: r, status: "loaded" })}>
                      Загрузка завершена
                    </Button>
                    <Button size="sm" variant={status === "departed" ? "default" : "outline"}
                      onClick={() => upsertStatus.mutate({ route: r, status: "departed" })}>
                      Машина уехала
                    </Button>
                    {hasReturns && (
                      <Button size="sm" variant={status === "return_accepted" ? "default" : "outline"}
                        onClick={() => upsertStatus.mutate({ route: r, status: "return_accepted" })}>
                        Принять возврат
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <Dialog open={!!openCard} onOpenChange={(o) => !o && setOpenCard(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Маршрут №{openedRoute?.route_number}
            </DialogTitle>
            <DialogDescription>
              Информация для отгрузки и возврата
            </DialogDescription>
          </DialogHeader>
          {openedRoute && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">Водитель</div>
                  <div className="font-medium">{openedRoute.assigned_driver ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Машина</div>
                  <div className="font-medium">{openedRoute.assigned_vehicle ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Статус на складе</div>
                  <Badge variant="outline" className={STATUS_STYLES[openedEvent?.status ?? "expected"]}>
                    {STATUS_LABELS[openedEvent?.status ?? "expected"]}
                  </Badge>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Дата</div>
                  <div className="font-medium">{openedRoute.route_date}</div>
                </div>
              </div>

              {openedRoute.comment && (
                <div className="rounded-md border border-border bg-secondary p-3">
                  <div className="mb-1 text-xs font-semibold text-muted-foreground inline-flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" /> Комментарий логиста
                  </div>
                  <div>{openedRoute.comment}</div>
                </div>
              )}

              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2 text-sm font-semibold">
                    <ClipboardCheck className="h-4 w-4" /> План загрузки ({openedOrders.length})
                  </div>
                  {openedEvent?.load_plan_confirmed_at && (
                    <Badge variant="outline" className="bg-emerald-100 text-emerald-900 border-emerald-200">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      План подтверждён
                    </Badge>
                  )}
                </div>

                <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:bg-blue-900/20 dark:text-blue-100">
                  <div className="inline-flex items-start gap-1.5">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Грузить нужно с учётом порядка выгрузки: товар для последних точек грузится глубже,
                      товар для первых точек должен быть доступен ближе к выгрузке.
                    </span>
                  </div>
                </div>

                {openedOrders.length === 0 ? (
                  <div className="text-xs text-muted-foreground">Заказов нет</div>
                ) : (
                  <ul className="space-y-2">
                    {openedOrders.map((p) => {
                      const o = orderById.get(p.orderId);
                      const plan = loadPlanByPoint.get(p.pointId);
                      return (
                        <li key={p.pointId} className="rounded-md border border-border bg-card p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-medium">
                              #{p.pointNumber}. Заказ {o?.order_number ?? p.orderId.slice(0, 6)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {o?.items_count ?? 0} поз. · {o?.total_weight_kg ?? 0} кг
                            </div>
                          </div>
                          {o?.contact_name && (
                            <div className="text-xs text-muted-foreground">👤 {o.contact_name}</div>
                          )}
                          {o?.delivery_address && (
                            <div className="text-xs text-muted-foreground">📍 {o.delivery_address}</div>
                          )}
                          {o?.comment && (
                            <div className="text-xs text-muted-foreground">💬 {o.comment}</div>
                          )}
                          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div>
                              <label className="text-xs text-muted-foreground">Место в кузове</label>
                              <Select
                                value={plan?.cargo_position ?? ""}
                                onValueChange={(v) =>
                                  upsertLoadPlan.mutate({
                                    pointId: p.pointId,
                                    routeId: openedRoute.id,
                                    cargo_position: v || null,
                                  })
                                }
                              >
                                <SelectTrigger className="mt-1 h-8">
                                  <SelectValue placeholder="Выбрать…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {CARGO_POSITIONS.map((cp) => (
                                    <SelectItem key={cp.value} value={cp.value}>
                                      {cp.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">Комментарий кладовщика</label>
                              <Input
                                defaultValue={plan?.warehouse_comment ?? ""}
                                placeholder="Например: хрупкое, не кантовать"
                                className="mt-1 h-8"
                                onBlur={(e) => {
                                  const val = e.target.value.trim();
                                  if (val === (plan?.warehouse_comment ?? "")) return;
                                  upsertLoadPlan.mutate({
                                    pointId: p.pointId,
                                    routeId: openedRoute.id,
                                    warehouse_comment: val || null,
                                  });
                                }}
                              />
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {openedOrders.length > 0 && (
                  <div className="mt-3 flex justify-end">
                    <Button
                      onClick={() => confirmLoadPlan.mutate()}
                      disabled={confirmLoadPlan.isPending}
                      variant={openedEvent?.load_plan_confirmed_at ? "outline" : "default"}
                    >
                      <ClipboardCheck className="mr-2 h-4 w-4" />
                      {openedEvent?.load_plan_confirmed_at ? "Подтвердить заново" : "Подтвердить план загрузки"}
                    </Button>
                  </div>
                )}
              </div>

              {/* Чек-лист загрузки товара со склада: нужно / загружено / остаток / подтвердить */}
              <DockLoadingChecklistBlock
                deliveryRouteId={openedRoute.id}
                warehouseId={openedRoute.source_warehouse_id}
                routeNumber={openedRoute.route_number}
              />

              <div>
                <div className="mb-2 inline-flex items-center gap-2 text-sm font-semibold">
                  <RotateCcw className="h-4 w-4" /> Возможный возврат на склад ({openedReturns.length})
                </div>
                {openedReturns.length === 0 ? (
                  <div className="text-xs text-muted-foreground">Возвратов пока нет</div>
                ) : (
                  <ul className="space-y-2">
                    {openedReturns.map((rp) => {
                      const o = returnOrderById.get(rp.order_id);
                      const photos = photosByPoint.get(rp.id) ?? [];
                      return (
                        <li key={rp.id} className="rounded-md border border-orange-200 bg-orange-50 p-3 dark:bg-orange-900/20">
                          <div className="font-medium">Заказ {o?.order_number ?? rp.order_id.slice(0, 6)}</div>
                          {o?.delivery_address && (
                            <div className="text-xs text-muted-foreground">{o.delivery_address}</div>
                          )}
                          <div className="mt-1 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                            <div>👤 Водитель: {openedRoute.assigned_driver ?? "—"}</div>
                            <div>🚚 Машина: {openedRoute.assigned_vehicle ?? "—"}</div>
                            {rp.dp_expected_return_at && (
                              <div>🕒 Ожид. возврат: {new Date(rp.dp_expected_return_at).toLocaleString("ru-RU")}</div>
                            )}
                            {rp.dp_return_comment && (
                              <div className="sm:col-span-2">💬 {rp.dp_return_comment}</div>
                            )}
                          </div>
                          {photos.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {photos.map((ph) => (
                                <a key={ph.id} href={ph.file_url} target="_blank" rel="noreferrer"
                                  className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs hover:bg-secondary">
                                  <ImageIcon className="h-3 w-3" />
                                  {ph.kind}
                                </a>
                              ))}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {openedEvent?.comment && (
                <div className="rounded-md border border-border bg-secondary p-3">
                  <div className="mb-1 text-xs font-semibold text-muted-foreground">Комментарий склада</div>
                  <div>{openedEvent.comment}</div>
                </div>
              )}

              <div>
                <label className="text-xs text-muted-foreground">Комментарий склада</label>
                <Textarea
                  defaultValue={openedEvent?.comment ?? ""}
                  rows={2}
                  onBlur={async (e) => {
                    const val = e.target.value.trim();
                    if (val === (openedEvent?.comment ?? "")) return;
                    const existing = openedEvent;
                    if (existing) {
                      await supabase.from("warehouse_dock_events").update({ comment: val || null }).eq("id", existing.id);
                    } else {
                      await supabase.from("warehouse_dock_events").insert({
                        delivery_route_id: openedRoute.id,
                        warehouse_id: openedRoute.source_warehouse_id,
                        event_date: date,
                        route_number: openedRoute.route_number,
                        driver_name: openedRoute.assigned_driver,
                        vehicle_plate: openedRoute.assigned_vehicle,
                        comment: val || null,
                      });
                    }
                    qc.invalidateQueries({ queryKey: ["wh-today-events", date] });
                    toast.success("Комментарий сохранён");
                  }}
                  className="mt-1"
                  placeholder="Заметка для склада…"
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
