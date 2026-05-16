import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGetAuth, apiPatch, apiPost } from "@/lib/api-client";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Hash, Calendar, Warehouse, Save, MapPin, Clock, CheckCircle2, AlertTriangle, Flag, Truck, Plus, ArrowUp, ArrowDown, GripVertical, Lock, RotateCcw, Package } from "lucide-react";
import { detectCargoFeatures, type CargoFeature } from "@/lib/cargo-features";
import { toast } from "sonner";
import { useState, useEffect, useMemo } from "react";
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
import { CarrierOffersBlockForRoute } from "@/components/CarrierOffersBlock";
import { CarrierConfirmationBlock } from "@/components/CarrierConfirmationBlock";
import { DriverGeoBlock } from "@/components/DriverGeoBlock";
import { ContactsCard, useRouteContacts } from "@/components/ContactsCard";
import { RouteMapBlock } from "@/components/RouteMapBlock";
import { RouteDeviationBlock } from "@/components/RouteDeviationBlock";
import { RouteEtaBlock } from "@/components/RouteEtaBlock";
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
  driver_id: string | null;
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
    driver_comment: string | null;
    driver_comment_is_important: boolean | null;
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
      try {
        return await apiGetAuth<Detail>(
          `/api/delivery-routes/${encodeURIComponent(deliveryRouteId)}/detail`,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg.includes("404") || /not_found/i.test(msg)) return null;
        throw e;
      }
    },
  });

  // Реалтайм-синхронизация между устройствами (логист видит действия водителя и наоборот)
  useRealtimeInvalidate("delivery_routes", [["delivery-route", deliveryRouteId], ["delivery-routes"]], {
    filter: `id=eq.${deliveryRouteId}`,
  });
  useRealtimeInvalidate(
    "route_points",
    [["delivery-route-points", data?.source_request_id]],
    {
      enabled: !!data?.source_request_id,
      filter: `route_id=eq.${data?.source_request_id}`,
    },
  );
  useRealtimeInvalidate("orders", [["delivery-route-points", data?.source_request_id]], {
    enabled: !!data?.source_request_id,
  });

  const { data: points } = useQuery({
    enabled: !!data?.source_request_id,
    queryKey: ["delivery-route-points", data?.source_request_id],
    queryFn: async (): Promise<PointRow[]> => {
      return await apiGetAuth<PointRow[]>(
        `/api/route-points?route_id=${encodeURIComponent(data!.source_request_id)}&embed=delivery`,
      );
    },
  });

  const pointIds = (points ?? []).map((p) => p.id);
  const { data: photoKindsByPoint } = useQuery({
    enabled: pointIds.length > 0,
    queryKey: ["route-point-photos-kinds", pointIds.join(",")],
    queryFn: async (): Promise<Record<string, Set<string>>> => {
      const rows = await apiGetAuth<Array<{ route_point_id: string; kind: string }>>(
        `/api/route-point-photos?point_ids=${encodeURIComponent(pointIds.join(","))}`,
      );
      const map: Record<string, Set<string>> = {};
      for (const r of rows) {
        if (!map[r.route_point_id]) map[r.route_point_id] = new Set();
        map[r.route_point_id].add(r.kind);
      }
      return map;
    },
  });

  const { data: driverGeo } = useQuery({
    queryKey: ["driver-geo-map", deliveryRouteId],
    refetchInterval: 30_000,
    queryFn: async () => {
      return await apiGetAuth<{
        last_driver_lat: number | null;
        last_driver_lng: number | null;
        last_driver_location_at: string | null;
      } | null>(`/api/delivery-routes/${encodeURIComponent(deliveryRouteId)}/driver-geo`);
    },
  });

  const [status, setStatus] = useState<DeliveryRouteStatus>("formed");
  const [comment, setComment] = useState("");
  const [addPointOpen, setAddPointOpen] = useState(false);

  // ===== Черновик порядка точек (drag & drop, как у водителя) =====
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    if (points) setDraftIds(points.map((p) => p.id));
  }, [points]);

  const COMPLETED_STATUSES: DeliveryPointStatus[] = [
    "delivered",
    "not_delivered",
    "returned_to_warehouse",
  ];
  const isCompletedStatus = (s: DeliveryPointStatus) => COMPLETED_STATUSES.includes(s);

  const pointsById = useMemo(() => {
    const m = new Map<string, PointRow>();
    (points ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [points]);

  const orderedDraft = useMemo<PointRow[]>(() => {
    return draftIds
      .map((id, idx) => {
        const p = pointsById.get(id);
        if (!p) return null;
        return { ...p, point_number: idx + 1 } as PointRow;
      })
      .filter((x): x is PointRow => x !== null);
  }, [draftIds, pointsById]);

  const originalIds = useMemo(() => (points ?? []).map((p) => p.id), [points]);
  const orderChanged = useMemo(
    () =>
      draftIds.length === originalIds.length &&
      draftIds.some((id, i) => id !== originalIds[i]),
    [draftIds, originalIds],
  );

  // Запрещаем перетаскивать завершённые точки и менять их относительный порядок.
  const completedOriginalOrder = useMemo(
    () =>
      (points ?? [])
        .filter((p) => isCompletedStatus(p.dp_status))
        .map((p) => p.id),
    [points],
  );
  const completedOrderBroken = useMemo(() => {
    const draftCompleted = draftIds.filter((id) => {
      const p = pointsById.get(id);
      return p && isCompletedStatus(p.dp_status);
    });
    if (draftCompleted.length !== completedOriginalOrder.length) return false;
    return draftCompleted.some((id, i) => id !== completedOriginalOrder[i]);
  }, [draftIds, pointsById, completedOriginalOrder]);

  const routeInProgress = data?.status === "in_progress" || data?.status === "issued";

  // Предупреждение по окнам приёма получателя при новом порядке
  const windowWarnings = useMemo(() => {
    const warns: string[] = [];
    orderedDraft.forEach((p) => {
      const from = p.client_window_from;
      const to = p.client_window_to;
      // эвристика: точка с узким окном перенесена далеко от исходной позиции
      const orig = (points ?? []).find((x) => x.id === p.id);
      if (!orig) return;
      const moved = Math.abs(orig.point_number - p.point_number);
      if ((from || to) && moved >= 2) {
        warns.push(
          `Точка №${p.point_number} (${p.order?.order_number ?? "—"}): окно ${from?.slice(0, 5) ?? "—"}–${to?.slice(0, 5) ?? "—"} — изменение позиции на ${moved}`,
        );
      }
    });
    return warns;
  }, [orderedDraft, points]);

  // Предупреждения по особенностям груза при изменении порядка разгрузки
  const cargoWarnings = useMemo(() => {
    const out: Array<{ orderNumber: string; features: CargoFeature[] }> = [];
    orderedDraft.forEach((p) => {
      const orig = (points ?? []).find((x) => x.id === p.id);
      if (!orig) return;
      if (orig.point_number === p.point_number) return;
      const feats = detectCargoFeatures(p.order?.comment, p.order?.driver_comment);
      if (feats.length > 0) {
        out.push({ orderNumber: p.order?.order_number ?? "—", features: feats });
      }
    });
    return out;
  }, [orderedDraft, points]);

  const moveDraft = (idx: number, dir: -1 | 1) => {
    setDraftIds((prev) => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const a = prev[idx];
      const b = prev[j];
      const pa = pointsById.get(a);
      const pb = pointsById.get(b);
      if (pa && isCompletedStatus(pa.dp_status)) return prev;
      if (pb && isCompletedStatus(pb.dp_status)) return prev;
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };
  const resetDraft = () => setDraftIds(originalIds);

  const handleDragStart = (id: string) => {
    const p = pointsById.get(id);
    if (p && isCompletedStatus(p.dp_status)) return;
    setDragId(id);
  };
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (id !== dragOverId) setDragOverId(id);
  };
  const handleDragEnd = () => {
    setDragId(null);
    setDragOverId(null);
  };
  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) {
      handleDragEnd();
      return;
    }
    const target = pointsById.get(targetId);
    const src = pointsById.get(dragId);
    if (target && isCompletedStatus(target.dp_status)) {
      handleDragEnd();
      return;
    }
    if (src && isCompletedStatus(src.dp_status)) {
      handleDragEnd();
      return;
    }
    setDraftIds((prev) => {
      const from = prev.indexOf(dragId);
      const to = prev.indexOf(targetId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    handleDragEnd();
  };

  const saveOrder = useMutation({
    mutationFn: async (ids: string[]) => {
      let who = "Логист";
      try {
        const me = await apiGetAuth<{ email: string | null; full_name: string | null }>(
          "/api/auth/me",
        );
        who = me.full_name ?? me.email ?? "Логист";
      } catch {
        // не критично
      }
      await apiPost("/api/route-points/reorder", {
        route_id: data!.source_request_id,
        ordered_ids: ids,
        changed_by: who,
      });
    },
    onSuccess: () => {
      toast.success("Новый порядок разгрузки сохранён");
      qc.invalidateQueries({ queryKey: ["delivery-route-points", data?.source_request_id] });
      qc.invalidateQueries({ queryKey: ["delivery-route", deliveryRouteId] });
      setConfirmOpen(false);
    },
    onError: (e: Error) => toast.error(e.message ?? "Не удалось сохранить порядок"),
  });

  useEffect(() => {
    if (data) {
      setStatus(data.status);
      setComment(data.comment ?? "");
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      await apiPatch(`/api/delivery-routes/${encodeURIComponent(deliveryRouteId)}`, {
        status,
        comment: comment || null,
      });
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
      await apiPatch(`/api/delivery-routes/${encodeURIComponent(deliveryRouteId)}`, {
        status: "completed" as DeliveryRouteStatus,
      });
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

            {/* Контакты по рейсу */}
            <DeliveryRouteContactsBlock deliveryRouteId={deliveryRouteId} />

            {/* Геопозиция водителя */}
            <DriverGeoBlock deliveryRouteId={deliveryRouteId} />

            {/* Отклонение от маршрута по GPS */}
            <RouteDeviationBlock
              deliveryRouteId={deliveryRouteId}
              routeNumber={data.route_number}
              driverName={data.assigned_driver}
              points={(points ?? []).map((p) => ({
                point_number: p.point_number,
                dp_status: p.dp_status,
                order: p.order
                  ? { latitude: p.order.latitude, longitude: p.order.longitude }
                  : null,
              }))}
              driverLat={driverGeo?.last_driver_lat ?? null}
              driverLng={driverGeo?.last_driver_lng ?? null}
              lastUpdateAt={driverGeo?.last_driver_location_at ?? null}
            />

            {/* ETA — прогноз времени прибытия */}
            <RouteEtaBlock
              deliveryRouteId={deliveryRouteId}
              routeNumber={data.route_number}
              sourceRouteId={data.source_request_id}
              points={(points ?? []).map((p) => ({
                point_number: p.point_number,
                status: p.dp_status,
                latitude: p.order?.latitude ?? null,
                longitude: p.order?.longitude ?? null,
                client_window_from: p.client_window_from,
                client_window_to: p.client_window_to,
                planned_arrival_at: p.dp_planned_arrival_at,
                order_id: p.order?.id ?? p.order_id,
                order_number: p.order?.order_number ?? "",
                contact_name: p.order?.contact_name ?? null,
              }))}
              driverLat={driverGeo?.last_driver_lat ?? null}
              driverLng={driverGeo?.last_driver_lng ?? null}
              lastUpdateAt={driverGeo?.last_driver_location_at ?? null}
              driverName={data.assigned_driver}
            />

            {/* Карта маршрута с позицией водителя */}
            {(points ?? []).length > 0 && (
              <RouteMapBlock
                points={(points ?? []).map((p) => ({
                  id: p.id,
                  point_number: p.point_number,
                  status: (p.dp_status === "delivered"
                    ? "completed"
                    : p.dp_status === "not_delivered" || p.dp_status === "returned_to_warehouse"
                      ? "failed"
                      : "pending") as "pending" | "completed" | "failed",
                  order: {
                    order_number: p.order?.order_number ?? "",
                    contact_name: p.order?.contact_name ?? null,
                    delivery_address: p.order?.delivery_address ?? null,
                    latitude: p.order?.latitude ?? null,
                    longitude: p.order?.longitude ?? null,
                  },
                }))}
                driverLocation={
                  driverGeo?.last_driver_lat != null && driverGeo?.last_driver_lng != null
                    ? {
                        latitude: driverGeo.last_driver_lat,
                        longitude: driverGeo.last_driver_lng,
                        capturedAt: driverGeo.last_driver_location_at,
                      }
                    : null
                }
              />
            )}

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

            {/* Подтверждение перевозчика логистом + подбор перевозчиков (Радиус Трек) */}
            {data.source_request_id && (
              <>
                <CarrierConfirmationBlock routeId={data.source_request_id} />
                <CarrierOffersBlockForRoute routeId={data.source_request_id} />
              </>
            )}

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
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  Очередь разгрузки
                  <span className="text-muted-foreground">({orderedDraft.length})</span>
                </h2>
                <div className="flex items-center gap-2">
                  {orderChanged && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5"
                      onClick={resetDraft}
                      disabled={saveOrder.isPending}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Сбросить
                    </Button>
                  )}
                  {orderChanged && (
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setConfirmOpen(true)}
                      disabled={saveOrder.isPending}
                    >
                      <Save className="h-3.5 w-3.5" />
                      Сохранить порядок
                    </Button>
                  )}
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
              </div>

              {orderChanged && routeInProgress && (
                <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                  Маршрут уже выполняется. Изменение порядка может повлиять на доставку.
                </div>
              )}
              {orderChanged && completedOrderBroken && (
                <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-700 dark:text-red-300">
                  <Lock className="mr-1 inline h-3.5 w-3.5" />
                  Завершённые точки нельзя переставлять — порядок отчётности нарушен.
                </div>
              )}
              {orderChanged && windowWarnings.length > 0 && (
                <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                  Возможны проблемы с режимом работы получателя:
                  <ul className="mt-1 ml-5 list-disc">
                    {windowWarnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              <AddManualPointDialog
                open={addPointOpen}
                onOpenChange={setAddPointOpen}
                sourceRequestId={data.source_request_id}
                deliveryRouteId={data.id}
                currentPointsCount={points?.length ?? 0}
              />
              <div className="divide-y divide-border">
                {orderedDraft.length === 0 ? (
                  <div className="px-4 py-6 text-center text-muted-foreground">
                    В маршруте пока нет точек. Нажмите «Добавить точку».
                  </div>
                ) : (
                  orderedDraft.map((p, idx, arr) => {
                    const locked = isCompletedStatus(p.dp_status);
                    const isDragging = dragId === p.id;
                    const isOver = dragOverId === p.id && dragId !== p.id;
                    return (
                    <div
                      key={p.id}
                      className={`space-y-3 px-4 py-4 transition-colors ${
                        isDragging ? "opacity-50" : ""
                      } ${isOver ? "bg-primary/5" : ""} ${locked ? "bg-muted/40" : ""}`}
                      draggable={!locked}
                      onDragStart={() => handleDragStart(p.id)}
                      onDragOver={(e) => handleDragOver(e, p.id)}
                      onDrop={(e) => handleDrop(e, p.id)}
                      onDragEnd={handleDragEnd}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded bg-primary/10 px-1.5 text-xs font-semibold text-primary">
                              {p.point_number}
                            </span>
                            {locked && (
                              <span className="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                                <Lock className="h-3 w-3" />
                                заблокирована
                              </span>
                            )}
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
                        <div className="flex items-center gap-1">
                          {!locked && (
                            <span
                              className="cursor-grab text-muted-foreground"
                              title="Перетащите для изменения порядка"
                            >
                              <GripVertical className="h-4 w-4" />
                            </span>
                          )}
                          <div className="flex flex-col gap-1">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-7 w-7"
                              disabled={idx === 0 || locked || saveOrder.isPending}
                              onClick={() => moveDraft(idx, -1)}
                              title="Переместить выше"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-7 w-7"
                              disabled={idx === arr.length - 1 || locked || saveOrder.isPending}
                              onClick={() => moveDraft(idx, 1)}
                              title="Переместить ниже"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
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
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Сохранить новый порядок разгрузки?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>Очередь будет обновлена и сразу станет видна водителю.</div>
                {routeInProgress && (
                  <div className="text-amber-600 dark:text-amber-400">
                    Маршрут уже выполняется. Изменение порядка может повлиять на доставку.
                  </div>
                )}
                {windowWarnings.length > 0 && (
                  <div className="text-amber-600 dark:text-amber-400">
                    Возможны нарушения окон приёма получателей.
                  </div>
                )}
                {cargoWarnings.length > 0 && (
                  <div className="space-y-1 rounded-md border-2 border-amber-400 bg-amber-50 p-2 dark:bg-amber-950/40 dark:border-amber-700">
                    <div className="flex items-center gap-1.5 font-semibold text-amber-900 dark:text-amber-100">
                      <Package className="h-4 w-4" />
                      Особенности груза в перемещаемых заказах
                    </div>
                    <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-900 dark:text-amber-100">
                      {cargoWarnings.map((w) => (
                        <li key={w.orderNumber}>
                          <span className="font-mono font-semibold">{w.orderNumber}</span>:{" "}
                          {w.features.map((f) => f.logistWarning).join(" ")}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {completedOrderBroken && (
                  <div className="text-red-600 dark:text-red-400">
                    Порядок завершённых точек нарушен — сохранение запрещено.
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              disabled={completedOrderBroken || saveOrder.isPending}
              onClick={(e) => {
                e.preventDefault();
                saveOrder.mutate(draftIds);
              }}
            >
              {saveOrder.isPending ? "Сохранение…" : "Сохранить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

function DeliveryRouteContactsBlock({ deliveryRouteId }: { deliveryRouteId: string }) {
  const { data, isLoading } = useRouteContacts({ deliveryRouteId });
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        Загрузка контактов…
      </div>
    );
  }
  return <ContactsCard contacts={data ?? []} title="Контакты по рейсу" />;
}
