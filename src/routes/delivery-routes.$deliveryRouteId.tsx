import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Hash, Calendar, Warehouse, Save, MapPin, Clock } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import {
  DELIVERY_ROUTE_STATUS_LABELS,
  DELIVERY_ROUTE_STATUS_ORDER,
  DELIVERY_ROUTE_STATUS_STYLES,
  type DeliveryRouteStatus,
} from "@/lib/deliveryRoutes";
import { RouteExecutionBlock } from "@/components/RouteExecutionBlock";
import { PointStatusEditor } from "@/components/PointStatusEditor";
import { OrderNotificationsBlock } from "@/components/OrderNotificationsBlock";
import { PaymentQrBlock } from "@/components/PaymentQrBlock";
import { RoutePointPhotosBlock } from "@/components/RoutePointPhotosBlock";
import { PointTimeTracker } from "@/components/PointTimeTracker";
import { PointIdleBlock, IDLE_REASON_LABELS, type IdleReason } from "@/components/PointIdleBlock";
import type {
  DeliveryPointStatus,
  DeliveryPointUndeliveredReason,
} from "@/lib/deliveryPointStatus";

export const Route = createFileRoute("/delivery-routes/$deliveryRouteId")({
  head: () => ({
    meta: [
      { title: "Маршрут — Радиус Трек" },
      { name: "description", content: "Карточка маршрута доставки" },
    ],
  }),
  component: DeliveryRoutePage,
});

type Detail = {
  id: string;
  route_number: string;
  route_date: string;
  status: DeliveryRouteStatus;
  comment: string | null;
  source_request_id: string;
  source_warehouse_id: string | null;
  assigned_driver: string | null;
  assigned_vehicle: string | null;
  source_request: { route_number: string } | null;
  source_warehouse: { name: string; city: string | null } | null;
};

type PointRow = {
  id: string;
  point_number: number;
  order_id: string;
  client_window_from: string | null;
  client_window_to: string | null;
  dp_status: DeliveryPointStatus;
  dp_undelivered_reason: DeliveryPointUndeliveredReason | null;
  dp_return_warehouse_id: string | null;
  dp_return_comment: string | null;
  dp_expected_return_at: string | null;
  dp_amount_received: number | null;
  dp_payment_comment: string | null;
  dp_planned_arrival_at: string | null;
  dp_actual_arrival_at: string | null;
  dp_unload_started_at: string | null;
  dp_unload_finished_at: string | null;
  dp_finished_at: string | null;
  order: {
    id: string;
    order_number: string;
    contact_name: string | null;
    delivery_address: string | null;
    comment: string | null;
    payment_type: string;
    amount_due: number | null;
    requires_qr: boolean;
    marketplace: string | null;
    cash_received: boolean;
    qr_received: boolean;
  } | null;
};

function DeliveryRoutePage() {
  const { deliveryRouteId } = Route.useParams();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["delivery-route", deliveryRouteId],
    queryFn: async (): Promise<Detail | null> => {
      const { data, error } = await supabase
        .from("delivery_routes")
        .select(
          "id, route_number, route_date, status, comment, source_request_id, source_warehouse_id, assigned_driver, assigned_vehicle, source_request:source_request_id(route_number), source_warehouse:source_warehouse_id(name, city)",
        )
        .eq("id", deliveryRouteId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Detail | null;
    },
  });

  const { data: points } = useQuery({
    enabled: !!data?.source_request_id,
    queryKey: ["delivery-route-points", data?.source_request_id],
    queryFn: async (): Promise<PointRow[]> => {
      const { data: pts, error } = await supabase
        .from("route_points")
        .select(
          "id, point_number, order_id, client_window_from, client_window_to, dp_status, dp_undelivered_reason, dp_return_warehouse_id, dp_return_comment, dp_expected_return_at, dp_amount_received, dp_payment_comment, dp_planned_arrival_at, dp_actual_arrival_at, dp_unload_started_at, dp_unload_finished_at, dp_finished_at, order:order_id(id, order_number, contact_name, delivery_address, comment, payment_type, amount_due, requires_qr, marketplace, cash_received, qr_received)",
        )
        .eq("route_id", data!.source_request_id)
        .order("point_number", { ascending: true });
      if (error) throw error;
      return (pts ?? []) as unknown as PointRow[];
    },
  });

  const pointIds = (points ?? []).map((p) => p.id);
  const { data: photoKindsByPoint } = useQuery({
    enabled: pointIds.length > 0,
    queryKey: ["route-point-photos-kinds", pointIds.join(",")],
    queryFn: async (): Promise<Record<string, Set<string>>> => {
      const { data: rows, error } = await supabase
        .from("route_point_photos")
        .select("route_point_id, kind")
        .in("route_point_id", pointIds);
      if (error) throw error;
      const map: Record<string, Set<string>> = {};
      for (const r of (rows ?? []) as Array<{ route_point_id: string; kind: string }>) {
        if (!map[r.route_point_id]) map[r.route_point_id] = new Set();
        map[r.route_point_id].add(r.kind);
      }
      return map;
    },
  });

  const [status, setStatus] = useState<DeliveryRouteStatus>("formed");
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (data) {
      setStatus(data.status);
      setComment(data.comment ?? "");
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("delivery_routes")
        .update({ status, comment: comment || null })
        .eq("id", deliveryRouteId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Маршрут сохранён");
      qc.invalidateQueries({ queryKey: ["delivery-route", deliveryRouteId] });
      qc.invalidateQueries({ queryKey: ["delivery-routes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fmt = (t: string | null) => (t ? t.slice(0, 5) : null);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Link to="/delivery-routes">
          <Button variant="ghost" size="sm" className="mb-4 gap-1.5">
            <ArrowLeft className="h-4 w-4" />К списку маршрутов
          </Button>
        </Link>

        {isLoading ? (
          <div className="text-muted-foreground">Загрузка...</div>
        ) : !data ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <p className="text-muted-foreground">Маршрут не найден</p>
          </div>
        ) : (
          <div className="space-y-5 rounded-lg border border-border bg-card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
                  <Hash className="h-6 w-6 text-muted-foreground" />
                  {data.route_number}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">Маршрут доставки</p>
              </div>
              <Badge variant="outline" className={DELIVERY_ROUTE_STATUS_STYLES[data.status]}>
                {DELIVERY_ROUTE_STATUS_LABELS[data.status]}
              </Badge>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field icon={<Calendar className="h-4 w-4" />} label="Дата">
                {new Date(data.route_date).toLocaleDateString("ru-RU")}
              </Field>
              <Field icon={<Hash className="h-4 w-4" />} label="Заявка">
                {data.source_request ? (
                  <Link
                    to="/transport-requests/$requestId"
                    params={{ requestId: data.source_request_id }}
                    className="text-primary hover:underline"
                  >
                    {data.source_request.route_number}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Field>
              <Field icon={<Warehouse className="h-4 w-4" />} label="Склад отправления">
                {data.source_warehouse ? (
                  <>
                    {data.source_warehouse.name}
                    {data.source_warehouse.city ? `, ${data.source_warehouse.city}` : ""}
                  </>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Field>
            </div>

            {/* Управление статусом */}
            <div className="rounded-lg border border-border p-4">
              <div className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Статус и комментарий
              </div>
              <div className="grid gap-3 sm:grid-cols-[200px_1fr_auto] sm:items-start">
                <Select value={status} onValueChange={(v) => setStatus(v as DeliveryRouteStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DELIVERY_ROUTE_STATUS_ORDER.map((s) => (
                      <SelectItem key={s} value={s}>
                        {DELIVERY_ROUTE_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Комментарий к маршруту"
                  rows={2}
                />
                <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-1.5">
                  <Save className="h-4 w-4" />
                  Сохранить
                </Button>
              </div>
            </div>

            {/* Исполнение маршрута: водитель + транспорт */}
            <RouteExecutionBlock
              deliveryRouteId={data.id}
              driver={data.assigned_driver}
              vehicle={data.assigned_vehicle}
            />

            {/* Прогресс по точкам */}
            {(() => {
              const list = points ?? [];
              const total = list.length;
              const delivered = list.filter((p) => p.dp_status === "delivered").length;
              const notDelivered = list.filter((p) => p.dp_status === "not_delivered").length;
              const returned = list.filter((p) => p.dp_status === "returned_to_warehouse").length;

              // Тайминги
              const lateCount = list.filter((p) => {
                if (!p.dp_planned_arrival_at || !p.dp_actual_arrival_at) return false;
                return new Date(p.dp_actual_arrival_at).getTime() > new Date(p.dp_planned_arrival_at).getTime();
              }).length;

              const unloadDurations = list
                .map((p) => {
                  if (!p.dp_unload_started_at || !p.dp_unload_finished_at) return null;
                  return (new Date(p.dp_unload_finished_at).getTime() - new Date(p.dp_unload_started_at).getTime()) / 60000;
                })
                .filter((v): v is number => v != null && v >= 0);
              const avgUnload = unloadDurations.length
                ? Math.round(unloadDurations.reduce((a, b) => a + b, 0) / unloadDurations.length)
                : null;

              const arrivals = list
                .map((p) => p.dp_actual_arrival_at)
                .filter((v): v is string => !!v)
                .map((v) => new Date(v).getTime());
              const finishes = list
                .map((p) => p.dp_finished_at)
                .filter((v): v is string => !!v)
                .map((v) => new Date(v).getTime());
              const totalRouteMin =
                arrivals.length && finishes.length
                  ? Math.round((Math.max(...finishes) - Math.min(...arrivals)) / 60000)
                  : null;

              const fmtMin = (m: number | null) => {
                if (m == null) return "—";
                const h = Math.floor(m / 60);
                const r = m % 60;
                return h > 0 ? `${h} ч ${r} мин` : `${r} мин`;
              };

              return (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <ProgressTile label="Всего точек" value={total} tone="muted" />
                    <ProgressTile label="Доставлено" value={delivered} tone="green" />
                    <ProgressTile label="Не доставлено" value={notDelivered} tone="red" />
                    <ProgressTile label="Возврат" value={returned} tone="orange" />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <StatTile label="Общее время маршрута" value={fmtMin(totalRouteMin)} />
                    <StatTile label="Опозданий" value={String(lateCount)} tone={lateCount > 0 ? "red" : undefined} />
                    <StatTile label="Среднее время разгрузки" value={fmtMin(avgUnload)} />
                  </div>
                </>
              );
            })()}

            {/* Точки маршрута */}
            <div className="rounded-lg border border-border">
              <div className="border-b border-border px-4 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  Точки маршрута
                  <span className="text-muted-foreground">({points?.length ?? 0})</span>
                </h2>
              </div>
              <div className="divide-y divide-border">
                {(points ?? []).length === 0 ? (
                  <div className="px-4 py-6 text-center text-muted-foreground">
                    В заявке нет точек доставки
                  </div>
                ) : (
                  (points ?? []).map((p) => (
                    <div key={p.id} className="space-y-3 px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded bg-muted px-1.5 text-xs font-semibold">
                              {p.point_number}
                            </span>
                            <span className="font-medium">{p.order?.order_number ?? "—"}</span>
                            <span className="text-sm text-muted-foreground">
                              · {p.order?.contact_name ?? "—"}
                            </span>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {p.order?.delivery_address ?? "—"}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {(p.client_window_from || p.client_window_to) && (
                              <span className="inline-flex items-center gap-1 font-mono">
                                <Clock className="h-3 w-3" />
                                {fmt(p.client_window_from) ?? "—"}–{fmt(p.client_window_to) ?? "—"}
                              </span>
                            )}
                            {p.order?.comment && <span>{p.order.comment}</span>}
                          </div>
                        </div>
                      </div>
                      {p.order && (
                        <PaymentQrBlock
                          routePointId={p.id}
                          order={{
                            id: p.order.id,
                            payment_type: p.order.payment_type,
                            amount_due: p.order.amount_due,
                            requires_qr: p.order.requires_qr,
                            marketplace: p.order.marketplace,
                            cash_received: p.order.cash_received,
                            qr_received: p.order.qr_received,
                          }}
                          point={{
                            dp_amount_received: p.dp_amount_received,
                            dp_payment_comment: p.dp_payment_comment,
                          }}
                        />
                      )}
                      <PointTimeTracker
                        routePointId={p.id}
                        times={{
                          dp_planned_arrival_at: p.dp_planned_arrival_at,
                          dp_actual_arrival_at: p.dp_actual_arrival_at,
                          dp_unload_started_at: p.dp_unload_started_at,
                          dp_unload_finished_at: p.dp_unload_finished_at,
                          dp_finished_at: p.dp_finished_at,
                        }}
                      />
                      <RoutePointPhotosBlock
                        routePointId={p.id}
                        orderId={p.order_id}
                        requiresQr={!!p.order?.requires_qr}
                        pointStatus={p.dp_status}
                      />
                      <PointStatusEditor
                        routePointId={p.id}
                        initial={{
                          dp_status: p.dp_status,
                          dp_undelivered_reason: p.dp_undelivered_reason,
                          dp_return_warehouse_id: p.dp_return_warehouse_id,
                          dp_return_comment: p.dp_return_comment,
                          dp_expected_return_at: p.dp_expected_return_at,
                        }}
                        order={
                          p.order
                            ? {
                                payment_type: p.order.payment_type,
                                requires_qr: p.order.requires_qr,
                                cash_received: p.order.cash_received,
                                qr_received: p.order.qr_received,
                              }
                            : undefined
                        }
                        hasQrPhoto={!!photoKindsByPoint?.[p.id]?.has("qr")}
                        hasProblemPhoto={!!photoKindsByPoint?.[p.id]?.has("problem")}
                      />
                      <OrderNotificationsBlock orderId={p.order_id} />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-sm font-medium text-foreground">{children}</div>
    </div>
  );
}

function ProgressTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "muted" | "green" | "red" | "orange";
}) {
  const toneClass = {
    muted: "border-border bg-muted/50 text-foreground",
    green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    red: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
    orange: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  }[tone];
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="text-xs font-medium uppercase tracking-wider opacity-80">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "red";
}) {
  const toneClass =
    tone === "red"
      ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
      : "border-border bg-muted/40 text-foreground";
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="text-xs font-medium uppercase tracking-wider opacity-80">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
