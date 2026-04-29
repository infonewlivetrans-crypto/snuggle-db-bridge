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
import { ArrowLeft, Hash, Calendar, Warehouse, Save, MapPin, Clock, CheckCircle2, AlertTriangle, Flag, Truck, Plus, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import {
  DELIVERY_ROUTE_STATUS_LABELS,
  DELIVERY_ROUTE_STATUS_ORDER,
  DELIVERY_ROUTE_STATUS_STYLES,
  type DeliveryRouteStatus,
} from "@/lib/deliveryRoutes";
import { RouteExecutionBlock } from "@/components/RouteExecutionBlock";
import { RouteManifestButton } from "@/components/RouteManifestButton";
import { AddManualPointDialog } from "@/components/AddManualPointDialog";
import { PointStatusEditor } from "@/components/PointStatusEditor";
import { OrderNotificationsBlock } from "@/components/OrderNotificationsBlock";
import { DeliveryReportBlock } from "@/components/DeliveryReportBlock";
import { RouteCompletionReportBlock } from "@/components/RouteCompletionReportBlock";
import { RouteIssueCheckBlock } from "@/components/RouteIssueCheckBlock";
import { DriverAccessLinkBlock } from "@/components/DriverAccessLinkBlock";
import { DriverGeoBlock } from "@/components/DriverGeoBlock";
import { RouteMapBlock } from "@/components/RouteMapBlock";
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
  dp_idle_started_at: string | null;
  dp_idle_finished_at: string | null;
  dp_idle_duration_minutes: number | null;
  dp_idle_reason: IdleReason | null;
  dp_idle_comment: string | null;
  order: {
    id: string;
    order_number: string;
    contact_name: string | null;
    contact_phone: string | null;
    delivery_address: string | null;
    latitude: number | null;
    longitude: number | null;
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
          "id, point_number, order_id, client_window_from, client_window_to, dp_status, dp_undelivered_reason, dp_return_warehouse_id, dp_return_comment, dp_expected_return_at, dp_amount_received, dp_payment_comment, dp_planned_arrival_at, dp_actual_arrival_at, dp_unload_started_at, dp_unload_finished_at, dp_finished_at, dp_idle_started_at, dp_idle_finished_at, dp_idle_duration_minutes, dp_idle_reason, dp_idle_comment, order:order_id(id, order_number, contact_name, contact_phone, delivery_address, latitude, longitude, comment, payment_type, amount_due, requires_qr, marketplace, cash_received, qr_received)",
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
  const [addPointOpen, setAddPointOpen] = useState(false);

  const reorder = useMutation({
    mutationFn: async ({ pointId, direction }: { pointId: string; direction: "up" | "down" }) => {
      const list = points ?? [];
      const idx = list.findIndex((p) => p.id === pointId);
      if (idx === -1) return;
      const swapWith = direction === "up" ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= list.length) return;
      const a = list[idx];
      const b = list[swapWith];
      // Двухходовая замена через временное значение, чтобы обойти UNIQUE(route_id, point_number) при наличии
      const tmp = -Math.abs(a.point_number) - 1;
      const tx1 = await supabase.from("route_points").update({ point_number: tmp }).eq("id", a.id);
      if (tx1.error) throw tx1.error;
      const tx2 = await supabase.from("route_points").update({ point_number: a.point_number }).eq("id", b.id);
      if (tx2.error) throw tx2.error;
      const tx3 = await supabase.from("route_points").update({ point_number: b.point_number }).eq("id", a.id);
      if (tx3.error) throw tx3.error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["delivery-route-points", data?.source_request_id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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

  const finalize = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("delivery_routes")
        .update({ status: "completed" as DeliveryRouteStatus })
        .eq("id", deliveryRouteId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Маршрут завершён");
      setStatus("completed");
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
        <div className="mb-4 flex items-center justify-between gap-2">
          <Link to="/delivery-routes">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />К списку маршрутов
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <RouteManifestButton deliveryRouteId={deliveryRouteId} />
            <Link to="/driver/$deliveryRouteId" params={{ deliveryRouteId }}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Truck className="h-4 w-4" />
                Открыть как водитель
              </Button>
            </Link>
          </div>
        </div>

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

            {/* Геопозиция водителя */}
            <DriverGeoBlock deliveryRouteId={deliveryRouteId} />

            {/* Исполнение маршрута: водитель + транспорт */}
            <RouteExecutionBlock
              deliveryRouteId={data.id}
              driver={data.assigned_driver}
              vehicle={data.assigned_vehicle}
            />

            {/* Проверка маршрута и выдача водителю */}
            <RouteIssueCheckBlock
              deliveryRouteId={data.id}
              status={data.status}
              driver={data.assigned_driver}
              vehicle={data.assigned_vehicle}
              points={(points ?? []).map((p) => ({
                point_number: p.point_number,
                order: p.order
                  ? {
                      order_number: p.order.order_number,
                      contact_name: p.order.contact_name,
                      contact_phone: p.order.contact_phone,
                      delivery_address: p.order.delivery_address,
                      latitude: p.order.latitude,
                      longitude: p.order.longitude,
                      payment_type: p.order.payment_type,
                      amount_due: p.order.amount_due,
                      requires_qr: p.order.requires_qr,
                    }
                  : null,
              }))}
            />

            {/* Доступ водителя по уникальной ссылке */}
            <DriverAccessLinkBlock deliveryRouteId={data.id} />
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
                  {(() => {
                    const idleList = list.filter(
                      (p) => (p.dp_idle_duration_minutes ?? 0) > 0 || !!p.dp_idle_started_at,
                    );
                    const totalIdle = idleList.reduce(
                      (s, p) => s + (p.dp_idle_duration_minutes ?? 0),
                      0,
                    );
                    const reasons = Array.from(
                      new Set(
                        idleList
                          .map((p) => p.dp_idle_reason)
                          .filter((r): r is IdleReason => !!r),
                      ),
                    );
                    if (idleList.length === 0) return null;
                    return (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <StatTile label="Общее время простоя" value={fmtMin(totalIdle)} tone={totalIdle > 0 ? "red" : undefined} />
                        <StatTile label="Точек с простоем" value={String(idleList.length)} />
                        <StatTile
                          label="Причины простоев"
                          value={
                            reasons.length
                              ? reasons.map((r) => IDLE_REASON_LABELS[r]).join(", ")
                              : "—"
                          }
                        />
                      </div>
                    );
                  })()}
                </>
              );
            })()}

            {/* Завершение и итог маршрута */}
            {(() => {
              const list = points ?? [];
              const FINAL: DeliveryPointStatus[] = ["delivered", "not_delivered", "returned_to_warehouse"];
              const pendingCount = list.filter((p) => !FINAL.includes(p.dp_status)).length;
              const isCompleted = data.status === "completed";
              const canFinalize = list.length > 0 && pendingCount === 0 && !isCompleted;

              const total = list.length;
              const delivered = list.filter((p) => p.dp_status === "delivered").length;
              const notDelivered = list.filter((p) => p.dp_status === "not_delivered").length;
              const returned = list.filter((p) => p.dp_status === "returned_to_warehouse").length;

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

              const totalIdle = list.reduce((s, p) => s + (p.dp_idle_duration_minutes ?? 0), 0);
              const problemsCount = notDelivered + returned;

              const amountDue = list.reduce((s, p) => s + (p.order?.amount_due ?? 0), 0);
              const amountReceived = list.reduce((s, p) => s + (p.dp_amount_received ?? 0), 0);
              const amountDiff = amountReceived - amountDue;

              const fmtMin = (m: number | null) => {
                if (m == null) return "—";
                const h = Math.floor(m / 60);
                const r = m % 60;
                return h > 0 ? `${h} ч ${r} мин` : `${r} мин`;
              };
              const fmtMoney = (n: number) => n.toLocaleString("ru-RU");

              return (
                <div className="rounded-lg border border-border p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                      <Flag className="h-4 w-4 text-muted-foreground" />
                      {isCompleted ? "Итог маршрута" : "Завершение маршрута"}
                    </h2>
                    {!isCompleted && (
                      <Button
                        size="sm"
                        className="gap-1.5"
                        disabled={!canFinalize || finalize.isPending}
                        onClick={() => finalize.mutate()}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Завершить маршрут
                      </Button>
                    )}
                  </div>

                  {!isCompleted && pendingCount > 0 && (
                    <div className="mb-3 flex items-start gap-1.5 rounded-md border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-sm text-orange-700 dark:text-orange-300">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        Нельзя завершить маршрут. Не все точки обработаны (осталось: {pendingCount}).
                      </span>
                    </div>
                  )}

                  {(isCompleted || canFinalize) && (
                    <>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <StatTile label="Всего точек" value={String(total)} />
                        <StatTile label="Доставлено" value={String(delivered)} />
                        <StatTile label="Не доставлено" value={String(notDelivered)} tone={notDelivered > 0 ? "red" : undefined} />
                        <StatTile label="Возврат на склад" value={String(returned)} tone={returned > 0 ? "red" : undefined} />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <StatTile label="Общее время маршрута" value={fmtMin(totalRouteMin)} />
                        <StatTile label="Общее время простоя" value={fmtMin(totalIdle || null)} tone={totalIdle > 0 ? "red" : undefined} />
                        <StatTile label="Проблем" value={String(problemsCount)} tone={problemsCount > 0 ? "red" : undefined} />
                        <StatTile label="Сумма к получению" value={fmtMoney(amountDue)} />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-2">
                        <StatTile label="Получено фактически" value={fmtMoney(amountReceived)} />
                        <StatTile
                          label="Расхождение по оплате"
                          value={(amountDiff > 0 ? "+" : "") + fmtMoney(amountDiff)}
                          tone={amountDiff !== 0 ? "red" : undefined}
                        />
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

            {/* Сводный отчёт менеджеру (после завершения маршрута) */}
            <RouteCompletionReportBlock deliveryRouteId={data.id} />

            {/* Точки маршрута */}
            <div className="rounded-lg border border-border">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  Точки маршрута
                  <span className="text-muted-foreground">({points?.length ?? 0})</span>
                </h2>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setAddPointOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  Добавить точку
                </Button>
              </div>
              <AddManualPointDialog
                open={addPointOpen}
                onOpenChange={setAddPointOpen}
                sourceRequestId={data.source_request_id}
                deliveryRouteId={data.id}
                currentPointsCount={points?.length ?? 0}
              />
              <div className="divide-y divide-border">
                {(points ?? []).length === 0 ? (
                  <div className="px-4 py-6 text-center text-muted-foreground">
                    В маршруте пока нет точек. Нажмите «Добавить точку».
                  </div>
                ) : (
                  (points ?? []).map((p, idx, arr) => (
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
                        <div className="flex flex-col gap-1">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            disabled={idx === 0 || reorder.isPending}
                            onClick={() => reorder.mutate({ pointId: p.id, direction: "up" })}
                            title="Переместить выше"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            disabled={idx === arr.length - 1 || reorder.isPending}
                            onClick={() => reorder.mutate({ pointId: p.id, direction: "down" })}
                            title="Переместить ниже"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
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
                      <PointIdleBlock
                        routePointId={p.id}
                        data={{
                          dp_idle_started_at: p.dp_idle_started_at,
                          dp_idle_finished_at: p.dp_idle_finished_at,
                          dp_idle_duration_minutes: p.dp_idle_duration_minutes,
                          dp_idle_reason: p.dp_idle_reason,
                          dp_idle_comment: p.dp_idle_comment,
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
                      <DeliveryReportBlock orderId={p.order_id} />
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
