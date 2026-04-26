import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
} from "@/lib/routes";
import type { Order } from "@/lib/orders";
import { PAYMENT_LABELS } from "@/lib/orders";
import {
  ArrowLeft,
  Calendar,
  User,
  MapPin,
  Clock,
  CheckCircle2,
  Package2,
  MessageSquare,
} from "lucide-react";

type RoutePointWithOrder = RoutePoint & { orders: Order };

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
    queryFn: async (): Promise<DeliveryRoute | null> => {
      const { data, error } = await supabase
        .from("routes")
        .select("*")
        .eq("id", routeId)
        .maybeSingle();
      if (error) throw error;
      return data as DeliveryRoute | null;
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
    mutationFn: async ({ pointId, status }: { pointId: string; status: PointStatus }) => {
      const updates: Partial<RoutePoint> = { status };
      const now = new Date().toISOString();
      if (status === "arrived") updates.arrived_at = now;
      if (status === "completed") updates.completed_at = now;
      const { error } = await supabase.from("route_points").update(updates).eq("id", pointId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["route-points", routeId] });
      toast.success("Статус точки обновлён");
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
              <div className="font-mono text-sm text-muted-foreground">{route.route_number}</div>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                Маршрут на {new Date(route.route_date).toLocaleDateString("ru-RU")}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <User className="h-4 w-4 text-muted-foreground" />
                  {route.driver_name}
                </span>
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
                    </div>
                    <div className="mt-2 flex items-start gap-1.5 text-sm text-foreground">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      {p.orders.delivery_address}
                    </div>
                    {p.orders.comment && (
                      <div className="mt-1 text-xs text-muted-foreground">{p.orders.comment}</div>
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
                        <span className="inline-flex items-center gap-1 text-green-700">
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
                        updatePoint.mutate({ pointId: p.id, status: v as PointStatus })
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
