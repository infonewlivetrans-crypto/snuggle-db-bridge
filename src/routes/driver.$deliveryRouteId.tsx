import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { logPointAction } from "@/lib/pointActions";
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
} from "lucide-react";
import { ReportProblemDialog } from "@/components/ReportProblemDialog";
import { toast } from "sonner";
import { PointStatusEditor } from "@/components/PointStatusEditor";
import { RoutePointPhotosBlock } from "@/components/RoutePointPhotosBlock";
import { PaymentQrBlock } from "@/components/PaymentQrBlock";
import { PaymentSummaryBlock } from "@/components/PaymentSummaryBlock";
import {
  DELIVERY_ROUTE_STATUS_LABELS,
  DELIVERY_ROUTE_STATUS_STYLES,
  type DeliveryRouteStatus,
} from "@/lib/deliveryRoutes";
import type {
  DeliveryPointStatus,
  DeliveryPointUndeliveredReason,
} from "@/lib/deliveryPointStatus";
import { PAYMENT_LABELS, type PaymentType } from "@/lib/orders";

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

  const { data, isLoading } = useQuery({
    queryKey: ["driver-route", deliveryRouteId],
    queryFn: async (): Promise<Detail | null> => {
      const { data, error } = await supabase
        .from("delivery_routes")
        .select(
          "id, route_number, route_date, status, source_request_id, assigned_driver, assigned_vehicle",
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
          "id, point_number, order_id, dp_status, dp_undelivered_reason, dp_return_warehouse_id, dp_return_comment, dp_expected_return_at, dp_amount_received, dp_payment_comment, order:order_id(id, order_number, contact_name, contact_phone, delivery_address, comment, payment_type, amount_due, requires_qr, marketplace, payment_status, cash_received, qr_received, map_link, latitude, longitude)",
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

  const finalize = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("delivery_routes")
        .update({ status: "completed" as DeliveryRouteStatus })
        .eq("id", deliveryRouteId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Маршрут завершён. Отчёт отправлен менеджеру.");
      qc.invalidateQueries({ queryKey: ["driver-route", deliveryRouteId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const FINAL: DeliveryPointStatus[] = ["delivered", "not_delivered", "returned_to_warehouse"];
  const list = points ?? [];
  const pendingCount = list.filter((p) => !FINAL.includes(p.dp_status)).length;
  const isCompleted = data?.status === "completed";
  const canFinalize = list.length > 0 && pendingCount === 0 && !isCompleted;

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
        ) : !data ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
            Маршрут не найден
          </div>
        ) : (
          <div className="space-y-4">
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

            {/* Точки */}
            {list.length === 0 ? (
              <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
                В маршруте нет точек
              </div>
            ) : (
              <div className="space-y-4">
                {list.map((p) => (
                  <DriverPointCard
                    key={p.id}
                    p={p}
                    routeId={data.source_request_id}
                    driverName={data.assigned_driver}
                    photoKinds={photoKindsByPoint?.[p.id]}
                  />
                ))}
              </div>
            )}

            {/* Завершение */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-2 flex items-center gap-2">
                <Flag className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold">Завершение маршрута</span>
              </div>
              {isCompleted ? (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
                  Маршрут завершён. Отчёт отправлен менеджеру.
                </div>
              ) : pendingCount > 0 ? (
                <div className="flex items-start gap-1.5 rounded-md border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-sm text-orange-700 dark:text-orange-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Обработайте все точки ({pendingCount} осталось), затем завершите маршрут.</span>
                </div>
              ) : (
                <Button
                  size="lg"
                  className="w-full gap-1.5"
                  disabled={!canFinalize || finalize.isPending}
                  onClick={() => finalize.mutate()}
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
  routeId,
  driverName,
  photoKinds,
}: {
  p: PointRow;
  routeId: string;
  driverName: string | null;
  photoKinds: Set<string> | undefined;
}) {
  const o = p.order;

  // Лог: водитель открыл карточку точки
  useEffect(() => {
    logPointAction({
      routePointId: p.id,
      orderId: p.order_id,
      routeId,
      action: "point_opened",
      actor: driverName ?? "Водитель",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id]);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded bg-muted px-1.5 text-xs font-semibold">
              {p.point_number}
            </span>
            <span className="font-semibold">{o?.order_number ?? "—"}</span>
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
            {o.contact_phone}
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
              }
            : undefined
        }
        hasQrPhoto={!!photoKinds?.has("qr")}
        hasProblemPhoto={!!photoKinds?.has("problem")}
        hasDocumentsPhoto={!!photoKinds?.has("documents")}
      />
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
          onClick={() => setProblemOpen(true)}
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
