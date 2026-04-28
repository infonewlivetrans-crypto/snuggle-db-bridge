import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  type DeliveryRoute,
  type RoutePoint,
  type RouteStatus,
  type PointStatus,
  ROUTE_STATUS_LABELS,
  ROUTE_STATUS_ORDER,
  ROUTE_STATUS_STYLES,
  POINT_STATUS_LABELS,
  POINT_STATUS_ORDER,
  POINT_STATUS_STYLES,
  REQUEST_TYPE_LABELS,
  REQUEST_TYPE_STYLES,
  checkVehicleFit,
} from "@/lib/routes";
import { pointStatusToOrderStatus } from "@/lib/routes";
import type { Order } from "@/lib/orders";
import { PAYMENT_LABELS } from "@/lib/orders";
import { DeliveryLocation } from "@/components/DeliveryLocation";
import { BODY_TYPE_LABELS } from "@/lib/carriers";
import type { BodyType } from "@/lib/carriers";
import {
  ArrowLeft,
  Calendar,
  User,
  Clock,
  CheckCircle2,
  Package2,
  MessageSquare,
  Database,
  AlertTriangle,
  Truck,
  Warehouse,
  Scale,
  Box,
} from "lucide-react";
import { QrCapture } from "@/components/QrCapture";

type RoutePointWithOrder = RoutePoint & { orders: Order };
type RouteWithRefs = DeliveryRoute & {
  warehouse: { id: string; name: string; city: string | null; address: string | null } | null;
  destination_warehouse: { id: string; name: string; city: string | null } | null;
  vehicle: {
    id: string;
    plate_number: string;
    brand: string | null;
    model: string | null;
    body_type: BodyType;
    capacity_kg: number | null;
    volume_m3: number | null;
  } | null;
  driver: { id: string; full_name: string; phone: string | null } | null;
};

export const Route = createFileRoute("/routes/$routeId")({
  head: () => ({
    meta: [{ title: "Маршрут — Радиус Трек" }],
  }),
  errorComponent: ({ error }) => {
    const router = useRouter();
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="mx-auto max-w-3xl px-4 py-12 text-center">
          <h2 className="text-xl font-semibold">Не удалось загрузить маршрут</h2>
          <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
          <Button onClick={() => router.invalidate()} className="mt-4">
            Повторить
          </Button>
        </div>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="mx-auto max-w-3xl px-4 py-12 text-center">
        <h2 className="text-xl font-semibold">Маршрут не найден</h2>
        <Link to="/routes" className="mt-4 inline-block text-sm text-primary hover:underline">
          ← К списку маршрутов
        </Link>
      </div>
    </div>
  ),
  component: RouteDetailPage,
});

function RouteDetailPage() {
  const { routeId } = Route.useParams();
  const queryClient = useQueryClient();

  const { data: route, isLoading: routeLoading } = useQuery({
    queryKey: ["route", routeId],
    queryFn: async (): Promise<RouteWithRefs | null> => {
      // Без FK в БД делаем 2 запроса вместо embed
      const { data, error } = await supabase
        .from("routes")
        .select("*")
        .eq("id", routeId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const r = data as DeliveryRoute;

      const [wh, dwh, veh, drv] = await Promise.all([
        r.warehouse_id
          ? supabase.from("warehouses").select("id, name, city, address").eq("id", r.warehouse_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        r.destination_warehouse_id
          ? supabase.from("warehouses").select("id, name, city").eq("id", r.destination_warehouse_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        r.vehicle_id
          ? supabase
              .from("vehicles")
              .select("id, plate_number, brand, model, body_type, capacity_kg, volume_m3")
              .eq("id", r.vehicle_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        r.driver_id
          ? supabase.from("drivers").select("id, full_name, phone").eq("id", r.driver_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      return {
        ...r,
        warehouse: (wh.data ?? null) as RouteWithRefs["warehouse"],
        destination_warehouse: (dwh.data ?? null) as RouteWithRefs["destination_warehouse"],
        vehicle: (veh.data ?? null) as RouteWithRefs["vehicle"],
        driver: (drv.data ?? null) as RouteWithRefs["driver"],
      };
    },
  });

  const { data: points, isLoading: pointsLoading } = useQuery({
    queryKey: ["route-points", routeId],
    queryFn: async (): Promise<RoutePointWithOrder[]> => {
      const { data, error } = await supabase
        .from("route_points")
        .select("*, orders(*)")
        .eq("route_id", routeId)
        .order("point_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RoutePointWithOrder[];
    },
  });

  const updateRoute = useMutation({
    mutationFn: async (status: RouteStatus) => {
      const { error } = await supabase.from("routes").update({ status }).eq("id", routeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["route", routeId] });
      queryClient.invalidateQueries({ queryKey: ["routes"] });
      toast.success("Статус маршрута обновлён");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updatePoint = useMutation({
    mutationFn: async ({ pointId, status }: { pointId: string; status: PointStatus; orderId: string }) => {
      // Триггер sync_order_from_route_point на стороне БД сам обновит:
      // - статус заказа (delivered / not_delivered / awaiting_resend)
      // - запись в delivery_reports
      // - времена arrived_at / completed_at
      const { error } = await supabase
        .from("route_points")
        .update({ status })
        .eq("id", pointId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["route-points", routeId] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["delivery_reports"] });
      const outcome = pointStatusToOrderStatus(vars.status);
      if (outcome === "delivered") toast.success("Заказ доставлен · отчёт создан");
      else if (outcome === "defective")
        toast.warning("Брак · заказ помечен «требуется повторная доставка»");
      else if (vars.status === "returned_to_warehouse")
        toast.warning("Возврат на склад · заказ ожидает повторной отправки");
      else if (outcome === "not_delivered") toast.error("Заказ не доставлен · уведомление отправлено");
      else toast.success("Статус точки обновлён");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (routeLoading || pointsLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="mx-auto max-w-5xl px-4 py-12 text-center text-muted-foreground">
          Загрузка маршрута...
        </div>
      </div>
    );
  }

  if (!route) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="mx-auto max-w-3xl px-4 py-12 text-center">
          <h2 className="text-xl font-semibold">Маршрут не найден</h2>
          <Link to="/routes" className="mt-4 inline-block text-sm text-primary hover:underline">
            ← К списку маршрутов
          </Link>
        </div>
      </div>
    );
  }

  const completedCount = points?.filter((p) => p.status === "completed").length ?? 0;
  const totalCount = points?.length ?? 0;
  const defectiveCount = points?.filter((p) => p.status === "defective").length ?? 0;
  const failedCount =
    points?.filter((p) => {
      const o = pointStatusToOrderStatus(p.status);
      return o === "not_delivered";
    }).length ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          to="/routes"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          К списку маршрутов
        </Link>

        {/* Шапка маршрута */}
        <div className="mb-6 rounded-lg border border-border bg-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-mono text-sm text-muted-foreground">{route.route_number}</div>
                <Badge variant="outline" className={REQUEST_TYPE_STYLES[route.request_type]}>
                  {REQUEST_TYPE_LABELS[route.request_type]}
                </Badge>
                <Badge variant="outline" className="border-border bg-secondary text-xs text-muted-foreground">
                  <Database className="mr-1 h-3 w-3" />
                  Источник: 1С
                </Badge>
              </div>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                Маршрут на {new Date(route.route_date).toLocaleDateString("ru-RU")}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <User className="h-4 w-4 text-muted-foreground" />
                  {route.driver?.full_name ?? route.driver_name ?? "—"}
                </span>
                {route.vehicle && (
                  <span className="inline-flex items-center gap-1.5">
                    <Truck className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono">{route.vehicle.plate_number}</span>
                    <span className="text-muted-foreground">
                      {[route.vehicle.brand, route.vehicle.model].filter(Boolean).join(" ")}
                    </span>
                  </span>
                )}
                {route.warehouse && (
                  <span className="inline-flex items-center gap-1.5">
                    <Warehouse className="h-4 w-4 text-muted-foreground" />
                    {route.warehouse.name}
                    {route.warehouse.city ? ` · ${route.warehouse.city}` : ""}
                  </span>
                )}
                {route.destination_warehouse && (
                  <span className="inline-flex items-center gap-1.5">
                    <Warehouse className="h-4 w-4 text-muted-foreground" />
                    → {route.destination_warehouse.name}
                    {route.destination_warehouse.city ? ` · ${route.destination_warehouse.city}` : ""}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  {new Date(route.route_date).toLocaleDateString("ru-RU", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  {completedCount} / {totalCount} доставлено
                </span>
              </div>
              {route.comment && (
                <div className="mt-3 inline-flex items-start gap-1.5 rounded-md bg-secondary px-3 py-2 text-sm text-foreground">
                  <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {route.comment}
                </div>
              )}
            </div>

            <div className="flex flex-col items-end gap-2">
              <Badge variant="outline" className={ROUTE_STATUS_STYLES[route.status]}>
                {ROUTE_STATUS_LABELS[route.status]}
              </Badge>
              <Select
                value={route.status}
                onValueChange={(v) => updateRoute.mutate(v as RouteStatus)}
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROUTE_STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {ROUTE_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Заявка на транспорт: сводка и проверка ТС */}
        <RequestSummary route={route} />

        {/* Уведомления о брака / недоставке */}

        {(defectiveCount > 0 || failedCount > 0) && (
          <div className="mb-4 space-y-2">
            {defectiveCount > 0 && (
              <div className="rt-alert rt-alert-warning">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="text-sm">
                  <div className="font-semibold">
                    Брак: {defectiveCount} {defectiveCount === 1 ? "заказ" : "заказа"} требуют повторной отправки
                  </div>
                  <div className="opacity-80">
                    Заказы помечены как «Ожидают повторной отправки». Логист может добавить их в следующий маршрут.
                  </div>
                </div>
              </div>
            )}
            {failedCount > 0 && (
              <div className="rt-alert rt-alert-danger">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="text-sm">
                  <div className="font-semibold">
                    Не доставлено: {failedCount} {failedCount === 1 ? "заказ" : "заказа"}
                  </div>
                  <div className="opacity-80">Уведомления отправлены менеджеру и логисту.</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Точки */}
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Точки доставки</h2>
          <span className="text-sm text-muted-foreground">{totalCount} точек</span>
        </div>

        {totalCount === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card py-12 text-center">
            <Package2 className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">В маршруте нет точек</div>
          </div>
        ) : (
          <ol className="space-y-3">
            {points!.map((p) => (
              <li
                key={p.id}
                className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/30"
              >
                <div className="flex items-start gap-4">
                  {/* Номер точки */}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-base font-bold text-primary-foreground">
                    {p.point_number}
                  </div>

                  {/* Информация */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-foreground">
                        {p.orders.order_number}
                      </span>
                      <Badge variant="outline" className={POINT_STATUS_STYLES[p.status]}>
                        {POINT_STATUS_LABELS[p.status]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {PAYMENT_LABELS[p.orders.payment_type]}
                      </span>
                      {p.orders.requires_qr && (
                        <TooltipProvider delayDuration={150}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="outline"
                                className={`cursor-help ${
                                  p.orders.qr_received
                                    ? "border-green-300 bg-green-100 text-green-900"
                                    : "border-amber-300 bg-amber-100 text-amber-900"
                                }`}
                              >
                                QR: {p.orders.qr_received ? "получен" : "не получен"}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              {p.orders.qr_photo_uploaded_at ? (
                                <div className="text-xs">
                                  <div>
                                    Загружено:{" "}
                                    {new Date(p.orders.qr_photo_uploaded_at).toLocaleString("ru-RU")}
                                  </div>
                                  <div>
                                    Кем: {p.orders.qr_photo_uploaded_by ?? "—"}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs">QR-фото ещё не загружено</span>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    <div className="mt-2">
                      <DeliveryLocation order={p.orders} compact />
                    </div>
                    {p.orders.comment && (
                      <div className="mt-1 text-xs text-muted-foreground">{p.orders.comment}</div>
                    )}
                    {(p.orders.requires_qr || p.orders.qr_photo_url) && (
                      <div className="mt-2">
                        <QrCapture
                          orderId={p.orders.id}
                          orderNumber={p.orders.order_number}
                          requiresQr={p.orders.requires_qr}
                          qrPhotoUrl={p.orders.qr_photo_url}
                          qrUploadedAt={p.orders.qr_photo_uploaded_at}
                          compact
                        />
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      {p.planned_time && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          План: {p.planned_time.slice(0, 5)}
                        </span>
                      )}
                      {p.arrived_at && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Прибытие: {new Date(p.arrived_at).toLocaleTimeString("ru-RU", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                      {p.completed_at && (
                        <span className="inline-flex items-center gap-1 font-medium text-foreground">
                          <CheckCircle2 className="h-3 w-3" />
                          Доставлено: {new Date(p.completed_at).toLocaleTimeString("ru-RU", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Управление статусом */}
                  <div className="shrink-0">
                    <Select
                      value={p.status}
                      onValueChange={(v) =>
                        updatePoint.mutate({
                          pointId: p.id,
                          status: v as PointStatus,
                          orderId: p.order_id,
                        })
                      }
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {POINT_STATUS_ORDER.map((s) => (
                          <SelectItem key={s} value={s}>
                            {POINT_STATUS_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </main>
    </div>
  );
}

function RequestSummary({ route }: { route: RouteWithRefs }) {
  const fit = checkVehicleFit({
    vehicle: route.vehicle,
    totalWeightKg: Number(route.total_weight_kg ?? 0),
    totalVolumeM3: Number(route.total_volume_m3 ?? 0),
    requiredBodyType: route.required_body_type,
  });
  return (
    <div className="mb-4 rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Заявка на транспорт</h2>
        {route.required_body_type && (
          <span className="text-xs text-muted-foreground">
            Требуется кузов: {BODY_TYPE_LABELS[route.required_body_type]}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <div className="text-xs text-muted-foreground">Точек</div>
          <div className="font-semibold text-foreground">{route.points_count}</div>
        </div>
        <div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Scale className="h-3 w-3" /> Вес
          </div>
          <div className="font-semibold text-foreground">
            {Number(route.total_weight_kg ?? 0).toFixed(2)} кг
          </div>
          {fit.weightLoadPct !== null && (
            <div className="text-xs text-muted-foreground">
              Загрузка: {fit.weightLoadPct.toFixed(0)}%
            </div>
          )}
        </div>
        <div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Box className="h-3 w-3" /> Объём
          </div>
          <div className="font-semibold text-foreground">
            {Number(route.total_volume_m3 ?? 0).toFixed(2)} м³
          </div>
          {fit.volumeLoadPct !== null && (
            <div className="text-xs text-muted-foreground">
              Загрузка: {fit.volumeLoadPct.toFixed(0)}%
            </div>
          )}
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Машина</div>
          <div className="font-semibold text-foreground">
            {route.vehicle ? route.vehicle.plate_number : "—"}
          </div>
          {route.vehicle && (
            <div className="text-xs text-muted-foreground">
              {BODY_TYPE_LABELS[route.vehicle.body_type]}
              {route.vehicle.capacity_kg ? ` · ${route.vehicle.capacity_kg} кг` : ""}
              {route.vehicle.volume_m3 ? ` · ${route.vehicle.volume_m3} м³` : ""}
            </div>
          )}
        </div>
      </div>
      {route.vehicle && !fit.ok && (
        <div className="rt-alert rt-alert-warning mt-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="font-medium">
            Выбранный транспорт не подходит по{" "}
            {[
              fit.issues.includes("capacity_kg") && "весу",
              fit.issues.includes("volume_m3") && "объёму",
              fit.issues.includes("body_type") && "типу кузова",
            ]
              .filter(Boolean)
              .join(" / ")}
          </div>
        </div>
      )}
    </div>
  );
}
