import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { logPointAction } from "@/lib/pointActions";
import { getCurrentCoords } from "@/lib/gps";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Truck,
  MapPin,
  Phone,
  MessageCircle,
  Headphones,
  Wallet,
  QrCode,
  CheckCircle2,
  ArrowLeft,
  Hash,
  Flag,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  MessageSquare,
} from "lucide-react";
import { apiGetAuth } from "@/lib/api-client";
import { ReportProblemDialog } from "@/components/ReportProblemDialog";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { RouteManifestButton } from "@/components/RouteManifestButton";
import { toast } from "sonner";
import { PointStatusEditor } from "@/components/PointStatusEditor";
import { PointActionsHistory } from "@/components/PointActionsHistory";
import { RoutePointPhotosBlock } from "@/components/RoutePointPhotosBlock";
import { DriverGeoTracker } from "@/components/DriverGeoTracker";
import { PaymentQrBlock } from "@/components/PaymentQrBlock";
import { PaymentSummaryBlock } from "@/components/PaymentSummaryBlock";
import { CarrierPaymentBlock } from "@/components/CarrierPaymentBlock";
import { CarrierDocumentsBlock } from "@/components/CarrierDocumentsBlock";
import { ContactsCard, useRouteContacts } from "@/components/ContactsCard";
import { TripStageBlock } from "@/components/TripStageBlock";
import { LoadingExclusionsBlock } from "@/components/LoadingExclusionsBlock";
import { formatRuPhone } from "@/lib/phone";
import {
  DELIVERY_ROUTE_STATUS_LABELS,
  DELIVERY_ROUTE_STATUS_STYLES,
  type DeliveryRouteStatus,
} from "@/lib/deliveryRoutes";
import type { TripStage } from "@/lib/tripStage";
import type {
  DeliveryPointStatus,
  DeliveryPointUndeliveredReason,
} from "@/lib/deliveryPointStatus";
import { PAYMENT_LABELS, type PaymentType } from "@/lib/orders";
import { OfflineQueueIndicator } from "@/components/OfflineQueueIndicator";
import { RecipientMessageForDriverBlock } from "@/components/RecipientMessageForDriverBlock";
import { runWithOfflineFallback, hasPendingForRoute, subscribeQueue, flushQueue } from "@/lib/offlineQueue";

export const Route = createFileRoute("/driver/$deliveryRouteId")({
  head: () => ({
    meta: [
      { title: "Маршрут водителя — Радиус Трек" },
      { name: "description", content: "Интерфейс водителя по маршруту доставки" },
    ],
  }),
  component: DriverRoutePage,
});

type Detail = {
  id: string;
  route_number: string;
  route_date: string;
  status: DeliveryRouteStatus;
  source_request_id: string;
  assigned_driver: string | null;
  assigned_vehicle: string | null;
  current_stage: TripStage;
};

type PointRow = {
  id: string;
  point_number: number;
  order_id: string;
  dp_status: DeliveryPointStatus;
  dp_undelivered_reason: DeliveryPointUndeliveredReason | null;
  dp_return_warehouse_id: string | null;
  dp_return_comment: string | null;
  dp_expected_return_at: string | null;
  dp_amount_received: number | null;
  dp_payment_comment: string | null;
  order: {
    id: string;
    order_number: string;
    contact_name: string | null;
    contact_phone: string | null;
    delivery_address: string | null;
    comment: string | null;
    payment_type: PaymentType;
    amount_due: number | null;
    requires_qr: boolean;
    marketplace: string | null;
    payment_status: string;
    cash_received: boolean;
    qr_received: boolean;
    map_link: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
};

const STATUS_TONES: Record<DeliveryPointStatus, string> = {
  waiting: "bg-slate-100 text-slate-900 border-slate-200",
  en_route: "bg-cyan-100 text-cyan-900 border-cyan-200",
  arrived: "bg-blue-100 text-blue-900 border-blue-200",
  unloading: "bg-indigo-100 text-indigo-900 border-indigo-200",
  delivered: "bg-emerald-100 text-emerald-900 border-emerald-200",
  not_delivered: "bg-red-100 text-red-900 border-red-200",
  returned_to_warehouse: "bg-orange-100 text-orange-900 border-orange-200",
};

const STATUS_LABELS: Record<DeliveryPointStatus, string> = {
  waiting: "Ожидание",
  en_route: "В пути",
  arrived: "Прибыл",
  unloading: "Разгрузка",
  delivered: "Доставлено",
  not_delivered: "Не доставлено",
  returned_to_warehouse: "Возврат на склад",
};

function DriverRoutePage() {
  const { deliveryRouteId } = Route.useParams();
  const qc = useQueryClient();

  const { data, isLoading, error: detailError } = useQuery({
    queryKey: ["driver-route", deliveryRouteId],
    queryFn: async (): Promise<Detail | null> => {
      const res = await fetch(`/api/driver/route/${deliveryRouteId}`, {
        credentials: "same-origin",
        headers: {
          accept: "application/json",
          ...((): Record<string, string> => {
            try {
              const t = window.localStorage.getItem("rt-access-token");
              return t ? { authorization: `Bearer ${t}` } : {};
            } catch {
              return {};
            }
          })(),
        },
      });
      if (res.status === 403) throw new Error("forbidden");
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { route: Detail | null };
      return body.route;
    },
    retry: false,
  });
  const isForbidden = detailError instanceof Error && detailError.message === "forbidden";

  // Реалтайм: изменения рейса/точек/заказов с других устройств — автоматически инвалидируем кэш
  useRealtimeInvalidate("delivery_routes", [["driver-route", deliveryRouteId]], {
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
      const fields =
        "id, point_number, order_id, dp_status, dp_undelivered_reason, dp_return_warehouse_id, dp_return_comment, dp_expected_return_at, dp_amount_received, dp_payment_comment, order:order_id(id, order_number, contact_name, contact_phone, delivery_address, comment, payment_type, amount_due, requires_qr, marketplace, payment_status, cash_received, qr_received, map_link, latitude, longitude)";
      const pts = await apiGetAuth<PointRow[]>(
        `/api/route-points?route_id=${encodeURIComponent(data!.source_request_id)}&fields=${encodeURIComponent(fields)}`,
      );
      return (pts ?? []) as PointRow[];
    },
  });

  const pointIds = (points ?? []).map((p) => p.id);
  const { data: photoKindsByPoint } = useQuery({
    enabled: pointIds.length > 0,
    queryKey: ["route-point-photos-kinds", pointIds.join(",")],
    queryFn: async (): Promise<Record<string, Set<string>>> => {
      const rows = await apiGetAuth<Array<{ route_point_id: string; kind: string }>>(
        `/api/route-point-photos?point_ids=${encodeURIComponent(pointIds.join(","))}&fields=route_point_id,kind`,
      );
      const map: Record<string, Set<string>> = {};
      for (const r of rows ?? []) {
        if (!map[r.route_point_id]) map[r.route_point_id] = new Set();
        map[r.route_point_id].add(r.kind);
      }
      return map;
    },
  });

  const orderIdsKey = (points ?? [])
    .map((p) => p.order_id)
    .filter(Boolean)
    .sort()
    .join(",");
  const { data: unreadDriverMsgs } = useQuery({
    enabled: orderIdsKey.length > 0,
    queryKey: ["driver-unread-client-msgs", orderIdsKey],
    queryFn: () =>
      apiGetAuth<{ items: Array<{ order_id: string; unread: number }> }>(
        `/api/driver/unread-client-messages?order_ids=${encodeURIComponent(orderIdsKey)}`,
      ),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  const unreadByOrderId = new Map<string, number>();
  for (const it of unreadDriverMsgs?.items ?? []) {
    unreadByOrderId.set(it.order_id, it.unread);
  }

  // Подписка на изменения очереди для актуальности валидаций
  const [, setQueueTick] = useState(0);
  useEffect(() => subscribeQueue(() => setQueueTick((n) => n + 1)), []);

  const finalize = useMutation({
    mutationFn: async (errors: string[]) => {
      if (errors.length > 0) {
        throw new Error(errors[0]);
      }
      const gps = await getCurrentCoords();
      const lastPoint = (points ?? [])[(points ?? []).length - 1];
      const res = await runWithOfflineFallback(
        "route_finish",
        { deliveryRouteId },
        async () => {
          const { apiPatch } = await import("@/lib/api-client");
          await apiPatch(`/api/delivery-routes/${deliveryRouteId}`, { status: "completed" });
          if (lastPoint) {
            await logPointAction({
              routePointId: lastPoint.id,
              orderId: lastPoint.order_id,
              routeId: data?.source_request_id ?? null,
              action: "route_completed",
              actor: data?.assigned_driver ?? "Водитель",
              details: gps ? { gps } : { gps_unavailable: true },
            });
          }
        },
      );
      return res;
    },
    onSuccess: (res) => {
      toast.success(
        res?.queued
          ? "Сохранено на устройстве. Маршрут будет завершён при появлении связи."
          : "Маршрут завершён. Отчёт отправлен менеджеру.",
      );
      qc.invalidateQueries({ queryKey: ["driver-route", deliveryRouteId] });
      void flushQueue().then(() => qc.invalidateQueries({ queryKey: ["driver-route", deliveryRouteId] }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reorderPoints = useMutation({
    mutationFn: async ({ index, dir }: { index: number; dir: -1 | 1 }) => {
      const list = points ?? [];
      const j = index + dir;
      if (j < 0 || j >= list.length) return;
      const ordered = list.map((p) => p.id);
      [ordered[index], ordered[j]] = [ordered[j], ordered[index]];
      const routeId = data?.source_request_id;
      if (!routeId) throw new Error("Маршрут не загружен");
      const { apiPost } = await import("@/lib/api-client");
      await apiPost("/api/route-points/reorder", {
        route_id: routeId,
        ordered_ids: ordered,
        changed_by: data?.assigned_driver ?? "Водитель",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["delivery-route-points", data?.source_request_id] });
      qc.invalidateQueries({ queryKey: ["request-orders", data?.source_request_id] });
      toast.success("Порядок точек сохранён");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const FINAL: DeliveryPointStatus[] = ["delivered", "not_delivered", "returned_to_warehouse"];
  const list = points ?? [];
  const pendingCount = list.filter((p) => !FINAL.includes(p.dp_status)).length;
  const isCompleted = data?.status === "completed";

  // Блокировка перехода к следующей точке: если у текущей открытой точки
  // требуется QR-код, а он не загружен/не подтверждён — следующие точки
  // показываем как заблокированные.
  let blockedFromIndex = list.length;
  let blockingPointNumber: number | null = null;
  for (let i = 0; i < list.length; i++) {
    const pt = list[i];
    if (FINAL.includes(pt.dp_status)) continue;
    if (pt.order?.requires_qr) {
      const hasQrPhoto = !!photoKindsByPoint?.[pt.id]?.has("qr");
      if (!pt.order.qr_received || !hasQrPhoto) {
        blockedFromIndex = i + 1;
        blockingPointNumber = pt.point_number;
      }
    }
    break;
  }

  // Подробная проверка перед завершением маршрута
  const validationErrors: string[] = (() => {
    const errs: string[] = [];
    if (list.length === 0) return errs;
    if (pendingCount > 0) {
      errs.push(
        "Рейс нельзя завершить. Сначала завершите все задания по заказам: сдайте деньги, документы, QR-код и остальные обязательные действия.",
      );
    }
    for (const p of list) {
      const num = p.order?.order_number ?? `точка №${p.point_number}`;
      const kinds = photoKindsByPoint?.[p.id];
      if (p.dp_status === "delivered") {
        if (p.order?.requires_qr) {
          const hasQrPhoto = !!kinds?.has("qr");
          if (!p.order.qr_received || !hasQrPhoto) {
            errs.push(`По заказу №${num} не загружен QR-код / не подтверждён QR.`);
          }
        }
        const isPrepaid = p.order?.payment_status === "paid";
        if (p.order?.payment_type === "cash" && !isPrepaid) {
          if (p.dp_amount_received == null || Number(p.dp_amount_received) <= 0) {
            errs.push(`По заказу №${num} не сдана сумма наличных.`);
          }
        }
      } else if (p.dp_status === "not_delivered") {
        if (!p.dp_undelivered_reason) {
          errs.push(`По заказу №${num} не указана причина недоставки.`);
        }
      } else if (p.dp_status === "returned_to_warehouse") {
        if (!p.dp_return_warehouse_id) {
          errs.push(`По заказу №${num} не указан склад возврата.`);
        }
        if (!p.dp_undelivered_reason) {
          errs.push(`По заказу №${num} не указана причина возврата.`);
        }
      }
    }
    return errs;
  })();

  // Блокировка завершения, если есть несинхронизированные действия по этому маршруту
  const pointIdSet = (points ?? []).map((p) => p.id);
  const hasOfflinePending = hasPendingForRoute(deliveryRouteId, pointIdSet);
  if (hasOfflinePending) {
    validationErrors.unshift(
      "Есть действия, не отправленные на сервер. Дождитесь окончания синхронизации.",
    );
  }

  const canFinalize = list.length > 0 && validationErrors.length === 0 && !isCompleted;

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            <span className="font-semibold">Водитель</span>
          </div>
          <Link to="/driver">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Мои маршруты
            </Button>
          </Link>
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-4 py-4 sm:py-6">
        {isLoading ? (
          <div className="text-muted-foreground">Загрузка...</div>
        ) : isForbidden ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center text-sm text-destructive">
            Этот маршрут не назначен вам.
          </div>
        ) : !data ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
            Маршрут не найден
          </div>
        ) : data.status === "draft" || data.status === "formed" ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center">
            <div className="text-base font-medium">Маршрут ещё не выдан водителю</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Дождитесь, пока менеджер проверит маршрут и выдаст его водителю.
            </div>
            <div className="mt-3">
              <Badge variant="outline" className={DELIVERY_ROUTE_STATUS_STYLES[data.status]}>
                {DELIVERY_ROUTE_STATUS_LABELS[data.status]}
              </Badge>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <OfflineQueueIndicator
              invalidateKeys={[
                ["driver-route", deliveryRouteId],
                ["delivery-route-points", data.source_request_id],
                ["route-point-photos-kinds"],
                ["trip-stage-events", deliveryRouteId],
                ["route-returns", deliveryRouteId],
              ]}
            />

            {/* Шапка маршрута */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 text-lg font-bold">
                    <Hash className="h-4 w-4 text-muted-foreground" />
                    {data.route_number}
                  </div>
                  <div className="mt-0.5 text-sm text-muted-foreground">
                    {new Date(data.route_date).toLocaleDateString("ru-RU")}
                    {data.assigned_driver ? ` · ${data.assigned_driver}` : ""}
                    {data.assigned_vehicle ? ` · ${data.assigned_vehicle}` : ""}
                  </div>
                </div>
                <Badge variant="outline" className={DELIVERY_ROUTE_STATUS_STYLES[data.status]}>
                  {DELIVERY_ROUTE_STATUS_LABELS[data.status]}
                </Badge>
              </div>
              <div className="mt-3">
                <RouteManifestButton deliveryRouteId={deliveryRouteId} className="w-full sm:w-auto" />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded border border-border bg-muted/40 p-2">
                  <div className="text-muted-foreground">Точек</div>
                  <div className="text-base font-semibold">{list.length}</div>
                </div>
                <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-2">
                  <div className="text-muted-foreground">Готово</div>
                  <div className="text-base font-semibold text-emerald-700 dark:text-emerald-300">
                    {list.length - pendingCount}
                  </div>
                </div>
                <div className="rounded border border-orange-500/30 bg-orange-500/10 p-2">
                  <div className="text-muted-foreground">Осталось</div>
                  <div className="text-base font-semibold text-orange-700 dark:text-orange-300">
                    {pendingCount}
                  </div>
                </div>
              </div>
            </div>

            {/* Контакты по рейсу: клиент, менеджер, логист, водитель, перевозчик */}
            <DriverContactsBlock deliveryRouteId={deliveryRouteId} />

            {/* GPS-трекинг водителя — только при активном маршруте */}
            <DriverGeoTracker
              deliveryRouteId={deliveryRouteId}
              driverName={data.assigned_driver}
              active={data.status !== "completed"}
            />

            {/* Этапы рейса — пошаговая работа водителя */}
            <TripStageBlock
              deliveryRouteId={deliveryRouteId}
              currentStage={data.current_stage}
              driverName={data.assigned_driver}
              orders={list
                .map((p) => p.order)
                .filter((o): o is NonNullable<typeof o> => !!o)
                .map((o) => ({
                  id: o.id,
                  order_number: o.order_number,
                  contact_name: o.contact_name,
                }))}
              blockFinishReason={
                validationErrors.length > 0 ? validationErrors[0] : null
              }
            />

            {/* Изменение состава во время погрузки */}
            {(data.current_stage === "arrived_loading" ||
              data.current_stage === "loaded") && (
              <LoadingExclusionsBlock
                deliveryRouteId={deliveryRouteId}
                currentStage={data.current_stage}
                driverName={data.assigned_driver}
                orders={list
                  .map((p) => p.order)
                  .filter((o): o is NonNullable<typeof o> => !!o)
                  .map((o) => ({
                    id: o.id,
                    order_number: o.order_number,
                    contact_name: o.contact_name,
                    delivery_address: o.delivery_address ?? null,
                  }))}
              />
            )}

            {/* Точки — показываем после выезда на линию */}
            {(data.current_stage === "in_progress" ||
              data.current_stage === "finished" ||
              data.current_stage === "cash_returned") &&
              (list.length === 0 ? (
                <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
                  В маршруте нет точек
                </div>
              ) : (
                <div className="space-y-4">
                  {list.map((p, idx) => (
                    <DriverPointCard
                      key={p.id}
                      p={p}
                      index={idx}
                      total={list.length}
                      routeId={data.source_request_id}
                      driverName={data.assigned_driver}
                      photoKinds={photoKindsByPoint?.[p.id]}
                      unreadCount={unreadByOrderId.get(p.order_id) ?? 0}
                      onReorder={(dir) => reorderPoints.mutate({ index: idx, dir })}
                      reordering={reorderPoints.isPending}
                      locked={isCompleted}
                      blockedReason={
                        idx >= blockedFromIndex && blockingPointNumber != null
                          ? `Сначала загрузите/подтвердите QR по точке №${blockingPointNumber}, затем переходите к следующей разгрузке.`
                          : null
                      }
                    />
                  ))}
                </div>
              ))}

            {/* Завершение */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-2 flex items-center gap-2">
                <Flag className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold">Завершение маршрута</span>
              </div>
              {isCompleted ? (
                <div className="space-y-3">
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
                    Маршрут завершён. Отчёт отправлен менеджеру.
                  </div>
                  {data?.source_request_id && (
                    <>
                      <CarrierDocumentsBlock
                        routeId={data.source_request_id}
                        mode="carrier"
                      />
                      <CarrierPaymentBlock routeId={data.source_request_id} />
                    </>
                  )}
                </div>
              ) : validationErrors.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-start gap-1.5 rounded-md border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-sm font-medium text-orange-800 dark:text-orange-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Перед завершением маршрута устраните проблемы:</span>
                  </div>
                  <ul className="space-y-1 rounded-md border border-orange-500/30 bg-orange-500/5 p-3 text-xs text-orange-900 dark:text-orange-200">
                    {validationErrors.map((err, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="mt-0.5">•</span>
                        <span>{err}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full gap-1.5"
                    onClick={() => {
                      const items = validationErrors.slice(0, 6);
                      const more = validationErrors.length - items.length;
                      toast.error("Нельзя завершить рейс", {
                        description: (
                          <div className="space-y-1">
                            <div className="font-medium">Не выполнены задания:</div>
                            <ul className="list-disc pl-4 space-y-0.5">
                              {items.map((e, i) => (
                                <li key={i}>{e}</li>
                              ))}
                              {more > 0 && <li>…и ещё {more}</li>}
                            </ul>
                          </div>
                        ),
                        duration: 8000,
                      });
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Завершить маршрут и отправить отчёт
                  </Button>
                </div>
              ) : (
                <Button
                  size="lg"
                  className="w-full gap-1.5"
                  disabled={!canFinalize || finalize.isPending}
                  onClick={() => finalize.mutate(validationErrors)}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Завершить маршрут и отправить отчёт
                </Button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function DriverPointCard({
  p,
  index,
  total,
  routeId,
  driverName,
  photoKinds,
  unreadCount,
  onReorder,
  reordering,
  locked,
  blockedReason,
}: {
  p: PointRow;
  index: number;
  total: number;
  routeId: string;
  driverName: string | null;
  photoKinds: Set<string> | undefined;
  unreadCount: number;
  onReorder: (dir: -1 | 1) => void;
  reordering: boolean;
  locked: boolean;
  blockedReason?: string | null;
}) {
  const o = p.order;

  // Лог: водитель открыл карточку точки (с GPS)
  useEffect(() => {
    (async () => {
      const gps = await getCurrentCoords();
      logPointAction({
        routePointId: p.id,
        orderId: p.order_id,
        routeId,
        action: "point_opened",
        actor: driverName ?? "Водитель",
        details: gps ? { gps } : { gps_unavailable: true },
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id]);

  if (blockedReason) {
    return (
      <div className="rounded-lg border border-orange-500/40 bg-orange-500/5 p-4 space-y-2 opacity-90">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded bg-muted px-1.5 text-xs font-semibold">
            {p.point_number}
          </span>
          <span className="font-semibold">{o?.order_number ?? "—"}</span>
          {unreadCount > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary"
              title="Новое сообщение от получателя"
            >
              <MessageSquare className="h-3 w-3" />
              Сообщение: {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
          <Badge variant="outline" className="ml-auto bg-orange-100 text-orange-900 border-orange-200 text-xs">
            Заблокировано
          </Badge>
        </div>
        <div className="flex items-start gap-1.5 text-sm text-orange-800 dark:text-orange-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{blockedReason}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded bg-muted px-1.5 text-xs font-semibold">
              {p.point_number}
            </span>
            <span className="font-semibold">{o?.order_number ?? "—"}</span>
            {unreadCount > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary"
                title="Новое сообщение от получателя"
              >
                <MessageSquare className="h-3 w-3" />
                Сообщение: {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
            {!locked && (
              <div className="ml-1 flex gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onReorder(-1)}
                  disabled={index === 0 || reordering}
                  aria-label="Выше"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onReorder(1)}
                  disabled={index === total - 1 || reordering}
                  aria-label="Ниже"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
          <div className="mt-1 text-sm font-medium">{o?.contact_name ?? "—"}</div>
        </div>
        <Badge variant="outline" className={STATUS_TONES[p.dp_status]}>
          {STATUS_LABELS[p.dp_status]}
        </Badge>
      </div>

      <div className="space-y-1 text-sm">
        <div className="flex items-start gap-1.5 text-muted-foreground">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{o?.delivery_address ?? "—"}</span>
        </div>
        {o?.contact_phone && (
          <a
            href={`tel:${o.contact_phone}`}
            className="flex items-center gap-1.5 text-primary hover:underline"
          >
            <Phone className="h-3.5 w-3.5" />
            {formatRuPhone(o.contact_phone)}
          </a>
        )}
      </div>

      {/* Менеджер по заказу */}
      <ManagerInfoAndActions
        contactName={o?.contact_name ?? null}
        orderId={p.order_id}
        orderNumber={o?.order_number ?? "—"}
        routePointId={p.id}
        routeId={routeId}
        driverName={driverName}
        clientPhone={o?.contact_phone ?? null}
        mapUrl={buildMapUrl(o)}
      />

      {/* Сообщение от получателя (target_role='driver') */}
      <RecipientMessageForDriverBlock orderId={p.order_id} />

      {/* Краткая сводка по оплате/QR */}
      <div className="flex flex-wrap gap-1.5 text-xs">
        {o?.amount_due != null && (
          <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-2 py-1">
            <Wallet className="h-3 w-3" />К получению: {o.amount_due.toLocaleString("ru-RU")}
          </span>
        )}
        {o && (
          <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-2 py-1">
            {PAYMENT_LABELS[o.payment_type]}
          </span>
        )}
        {o && (
          <span
            className={`inline-flex items-center gap-1 rounded border px-2 py-1 ${
              o.payment_status === "paid"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
            }`}
          >
            {o.payment_status === "paid" ? "Оплачено заранее" : "Не оплачено заранее"}
          </span>
        )}
        {o?.requires_qr && (
          <span className="inline-flex items-center gap-1 rounded border border-purple-500/30 bg-purple-500/10 px-2 py-1 text-purple-800 dark:text-purple-200">
            <QrCode className="h-3 w-3" />
            Нужен QR
          </span>
        )}
      </div>

      {o?.comment && (
        <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5 text-xs italic text-muted-foreground">
          {o.comment}
        </div>
      )}

      {/* Оплата и наличные — сводка с подсказками */}
      {o && (
        <PaymentSummaryBlock
          paymentType={o.payment_type}
          paymentStatus={o.payment_status}
          amountDue={o.amount_due}
          amountReceived={p.dp_amount_received}
          paymentComment={p.dp_payment_comment}
        />
      )}

      {/* Оплата / QR — переиспользуем существующий блок */}
      {o && (
        <PaymentQrBlock
          routePointId={p.id}
          order={{
            id: o.id,
            payment_type: o.payment_type,
            amount_due: o.amount_due,
            requires_qr: o.requires_qr,
            marketplace: o.marketplace,
            cash_received: o.cash_received,
            qr_received: o.qr_received,
          }}
          point={{
            dp_amount_received: p.dp_amount_received,
            dp_payment_comment: p.dp_payment_comment,
          }}
        />
      )}

      {/* Фото и документы */}
      <RoutePointPhotosBlock
        routePointId={p.id}
        orderId={p.order_id}
        requiresQr={!!o?.requires_qr}
        pointStatus={p.dp_status}
      />

      {/* Статус с причинами/возвратом — единый блок (валидирует фото QR / проблемы) */}
      <PointStatusEditor
        routePointId={p.id}
        initial={{
          dp_status: p.dp_status,
          dp_undelivered_reason: p.dp_undelivered_reason,
          dp_return_warehouse_id: p.dp_return_warehouse_id,
          dp_return_comment: p.dp_return_comment,
          dp_expected_return_at: p.dp_expected_return_at,
          dp_payment_comment: p.dp_payment_comment,
          dp_amount_received: p.dp_amount_received,
        }}
        order={
          o
            ? {
                payment_type: o.payment_type,
                requires_qr: o.requires_qr,
                cash_received: o.cash_received,
                qr_received: o.qr_received,
                payment_status: o.payment_status,
                amount_due: o.amount_due,
                latitude: o.latitude,
                longitude: o.longitude,
              }
            : undefined
        }
        orderId={p.order_id}
        routeId={routeId}
        driverName={driverName}
        hasQrPhoto={!!photoKinds?.has("qr")}
        hasProblemPhoto={!!photoKinds?.has("problem")}
        hasDocumentsPhoto={!!photoKinds?.has("documents")}
      />

      {/* История действий водителя по точке — с GPS-координатами */}
      <PointActionsHistory routePointId={p.id} title="История действий по точке" maxHeight="max-h-56" />
    </div>
  );
}

function buildMapUrl(
  o: { map_link: string | null; latitude: number | null; longitude: number | null; delivery_address: string | null } | null | undefined,
): string | null {
  if (!o) return null;
  if (o.map_link && /^https?:\/\//i.test(o.map_link)) return o.map_link;
  if (o.latitude != null && o.longitude != null) {
    return `https://yandex.ru/maps/?pt=${o.longitude},${o.latitude}&z=16&l=map`;
  }
  if (o.delivery_address && o.delivery_address.trim()) {
    return `https://yandex.ru/maps/?text=${encodeURIComponent(o.delivery_address)}`;
  }
  return null;
}

function buildSmsUrl(phone: string | null): string | null {
  if (!phone) return null;
  return `sms:${phone}`;
}

function ManagerInfoAndActions({
  contactName,
  orderId,
  orderNumber,
  routePointId,
  routeId,
  driverName,
  clientPhone,
  mapUrl,
}: {
  contactName: string | null;
  orderId: string;
  orderNumber: string;
  routePointId: string;
  routeId: string;
  driverName: string | null;
  clientPhone: string | null;
  mapUrl: string | null;
}) {
  const [problemOpen, setProblemOpen] = useState(false);

  const { data: manager } = useQuery({
    enabled: !!contactName,
    queryKey: ["client-manager", contactName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("manager_name, manager_phone")
        .eq("name", contactName!)
        .maybeSingle();
      if (error) throw error;
      return data as { manager_name: string | null; manager_phone: string | null } | null;
    },
  });

  const managerName = manager?.manager_name ?? null;
  const managerPhone = manager?.manager_phone ?? null;

  const log = (
    action:
      | "call_client"
      | "message_client"
      | "call_manager"
      | "open_map"
      | "report_problem",
    details?: Record<string, unknown>,
  ) =>
    logPointAction({
      routePointId,
      orderId,
      routeId,
      action,
      actor: driverName ?? "Водитель",
      details,
    });

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
        <div className="font-medium text-foreground">
          Менеджер:{" "}
          {managerName ?? <span className="italic text-muted-foreground">не назначен</span>}
        </div>
        {managerPhone && <div className="text-muted-foreground">Тел.: {managerPhone}</div>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          asChild
          variant="outline"
          size="lg"
          disabled={!clientPhone}
          className="h-11 gap-1.5"
        >
          <a
            href={clientPhone ? `tel:${clientPhone}` : "#"}
            onClick={() => clientPhone && log("call_client", { phone: clientPhone })}
          >
            <Phone className="h-4 w-4" />
            Позвонить клиенту
          </a>
        </Button>
        <Button
          asChild
          variant="outline"
          size="lg"
          disabled={!clientPhone}
          className="h-11 gap-1.5"
        >
          <a
            href={buildSmsUrl(clientPhone) ?? "#"}
            onClick={() => clientPhone && log("message_client", { phone: clientPhone })}
          >
            <MessageCircle className="h-4 w-4" />
            Написать клиенту
          </a>
        </Button>
        <Button
          asChild
          variant="outline"
          size="lg"
          disabled={!managerPhone}
          className="h-11 gap-1.5"
        >
          <a
            href={managerPhone ? `tel:${managerPhone}` : "#"}
            onClick={() =>
              managerPhone &&
              log("call_manager", { phone: managerPhone, manager: managerName })
            }
          >
            <Headphones className="h-4 w-4" />
            Позвонить менеджеру
          </a>
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="h-11 gap-1.5 border-orange-500/40 text-orange-700 hover:bg-orange-500/10 dark:text-orange-300"
          onClick={() => {
            log("report_problem");
            setProblemOpen(true);
          }}
        >
          <AlertTriangle className="h-4 w-4" />
          Сообщить о проблеме
        </Button>
      </div>

      <Button
        asChild
        variant="ghost"
        size="sm"
        disabled={!mapUrl}
        className="w-full gap-1.5"
      >
        <a
          href={mapUrl ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => mapUrl && log("open_map", { url: mapUrl })}
        >
          <MapPin className="h-4 w-4" />
          Открыть карту
        </a>
      </Button>

      <ReportProblemDialog
        open={problemOpen}
        onOpenChange={setProblemOpen}
        orderId={orderId}
        orderNumber={orderNumber}
        routePointId={routePointId}
        routeId={routeId}
        reportedBy={driverName ?? "Водитель"}
        managerName={managerName}
        managerPhone={managerPhone}
      />
    </div>
  );
}

function DriverContactsBlock({ deliveryRouteId }: { deliveryRouteId: string }) {
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
