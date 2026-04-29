import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { toast } from "sonner";
import { Truck, Package, RotateCcw, Warehouse as WhIcon, Calendar, MessageSquare, ImageIcon } from "lucide-react";

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
        .select("id, route_number, route_date, status, assigned_driver, assigned_vehicle, source_warehouse_id, comment, created_at")
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
  const routeIds = (routes ?? []).map((r) => r.id);
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

  const orderIds = (returnPoints ?? []).map((p) => p.order_id);
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

  const pointIds = (returnPoints ?? []).map((p) => p.id);
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

  const allOrderIds = Array.from(new Set((routePoints ?? []).map((p) => p.order_id)));
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
      const patch: Partial<DockEvent> & Record<string, unknown> = {
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
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wh-today-events", date] });
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
    const m = new Map<string, { orderId: string; pointNumber: number; status: string }[]>();
    (routePoints ?? []).forEach((p) => {
      const arr = m.get(p.route_id) ?? [];
      arr.push({ orderId: p.order_id, pointNumber: p.point_number, status: p.status });
      m.set(p.route_id, arr);
    });
    return m;
  }, [routePoints]);

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
              return (
                <div key={r.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">Маршрут №{r.route_number}</span>
                        <Badge variant="outline" className={STATUS_STYLES[status]}>
                          {STATUS_LABELS[status]}
                        </Badge>
                        {hasReturns && (
                          <Badge variant="outline" className="bg-orange-100 text-orange-900 border-orange-200">
                            <RotateCcw className="mr-1 h-3 w-3" />
                            Ожидается возврат
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1.5 grid grid-cols-1 gap-1 text-sm text-muted-foreground sm:grid-cols-3">
                        <div>👤 {r.assigned_driver ?? "Водитель не назначен"}</div>
                        <div>🚚 {r.assigned_vehicle ?? "Машина не назначена"}</div>
                        <div>📦 Точек: {ordersByRoute.get(r.id)?.length ?? 0}</div>
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
                <div className="mb-2 inline-flex items-center gap-2 text-sm font-semibold">
                  <Package className="h-4 w-4" /> Что нужно загрузить ({openedOrders.length})
                </div>
                {openedOrders.length === 0 ? (
                  <div className="text-xs text-muted-foreground">Заказов нет</div>
                ) : (
                  <ul className="divide-y divide-border rounded-md border border-border">
                    {openedOrders.map((p) => {
                      const o = orderById.get(p.orderId);
                      return (
                        <li key={p.orderId} className="px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-medium">
                              #{p.pointNumber}. Заказ {o?.order_number ?? p.orderId.slice(0, 6)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {o?.items_count ?? 0} поз. · {o?.total_weight_kg ?? 0} кг
                            </div>
                          </div>
                          {o?.delivery_address && (
                            <div className="text-xs text-muted-foreground">{o.delivery_address}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

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
