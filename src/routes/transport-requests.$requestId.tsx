import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Hash, MessageSquare, Warehouse, Calendar, Tag, CalendarClock, AlertTriangle } from "lucide-react";
import {
  REQUEST_TYPE_LABELS,
  REQUEST_STATUS_LABELS,
} from "./transport-requests.index";
import { RequestOrdersBlock } from "@/components/RequestOrdersBlock";
import { RequestOrderItemsBlock } from "@/components/RequestOrderItemsBlock";
import { RequestLoadingListBlock } from "@/components/RequestLoadingListBlock";
import { StockAvailabilityCheckBlock } from "@/components/StockAvailabilityCheckBlock";
import { StockReservationBlock } from "@/components/StockReservationBlock";
import { RequestWarehouseStatusBlock } from "@/components/RequestWarehouseStatusBlock";
import {
  REQ_WH_STATUS_LABELS,
  REQ_WH_STATUS_OK_FOR_DRIVER,
  type RequestWarehouseStatus,
} from "@/lib/requestWarehouseStatus";
import { RequestTotalsCards } from "@/components/RequestTotalsCards";
import { RequestWarehousesEditor } from "@/components/RequestWarehousesEditor";
import { TransportRequirementsBlock } from "@/components/TransportRequirementsBlock";
import { TransportCapacityCheck } from "@/components/TransportCapacityCheck";
import {
  TransportRequestStatusBlock,
  type RequestStatus,
} from "@/components/TransportRequestStatusBlock";
import { RequestSchedulingBlock } from "@/components/RequestSchedulingBlock";
import { DeliveryPointsBlock } from "@/components/DeliveryPointsBlock";
import { CreateRouteFromRequestBlock } from "@/components/CreateRouteFromRequestBlock";
import {
  PRIORITY_LABELS,
  PRIORITY_BADGE_CLASS,
  type RequestPriority,
} from "@/lib/requestPriority";
import type { BodyType } from "@/lib/carriers";

export const Route = createFileRoute("/transport-requests/$requestId")({
  head: () => ({
    meta: [
      { title: "Заявка на транспорт — Радиус Трек" },
      { name: "description", content: "Карточка заявки на транспорт" },
    ],
  }),
  component: TransportRequestDetailPage,
});

type RequestDetail = {
  id: string;
  route_number: string;
  request_type: string;
  status: string;
  route_date: string;
  comment: string | null;
  warehouse_id: string | null;
  destination_warehouse_id: string | null;
  points_count: number;
  total_weight_kg: number;
  total_volume_m3: number;
  source_warehouse?: { name: string; city: string | null } | null;
  destination_warehouse?: { name: string; city: string | null } | null;
  required_body_type: BodyType | null;
  required_capacity_kg: number | null;
  required_volume_m3: number | null;
  required_body_length_m: number | null;
  requires_tent: boolean;
  requires_manipulator: boolean;
  requires_straps: boolean;
  transport_comment: string | null;
  request_status: RequestStatus;
  request_status_changed_by: string | null;
  request_status_changed_at: string | null;
  request_status_comment: string | null;
  departure_time: string | null;
  request_priority: RequestPriority;
};

function TransportRequestDetailPage() {
  const { requestId } = Route.useParams();
  const [hasShortage, setHasShortage] = useState(false);
  const handleShortage = useCallback((v: boolean) => setHasShortage(v), []);

  const { data, isLoading } = useQuery({
    queryKey: ["transport-request", requestId],
    queryFn: async (): Promise<RequestDetail | null> => {
      const { data, error } = await supabase
        .from("routes")
        .select(
          "id, route_number, request_type, status, route_date, departure_time, request_priority, comment, warehouse_id, destination_warehouse_id, points_count, total_weight_kg, total_volume_m3, required_body_type, required_capacity_kg, required_volume_m3, required_body_length_m, requires_tent, requires_manipulator, requires_straps, transport_comment, request_status, request_status_changed_by, request_status_changed_at, request_status_comment, source_warehouse:warehouse_id(name, city), destination_warehouse:destination_warehouse_id(name, city)",
        )
        .eq("id", requestId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as RequestDetail | null;
    },
  });

  const { data: totals } = useQuery({
    queryKey: ["request-totals", requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("route_points")
        .select("order:order_id(total_weight_kg, total_volume_m3)")
        .eq("route_id", requestId);
      if (error) throw error;
      let weight = 0;
      let volume = 0;
      let count = 0;
      for (const r of (data ?? []) as any[]) {
        if (!r.order) continue;
        count++;
        weight += Number(r.order.total_weight_kg ?? 0);
        volume += Number(r.order.total_volume_m3 ?? 0);
      }
      return { weight, volume, count };
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Link to="/transport-requests">
          <Button variant="ghost" size="sm" className="mb-4 gap-1.5">
            <ArrowLeft className="h-4 w-4" />К списку заявок
          </Button>
        </Link>

        {isLoading ? (
          <div className="text-muted-foreground">Загрузка...</div>
        ) : !data ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <p className="text-muted-foreground">Заявка не найдена</p>
          </div>
        ) : (
          <div className="space-y-5 rounded-lg border border-border bg-card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
                  <Hash className="h-6 w-6 text-muted-foreground" />
                  {data.route_number}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">Карточка заявки на транспорт</p>
              </div>
              <Badge variant="outline">
                {REQUEST_STATUS_LABELS[data.status] ?? data.status}
              </Badge>
            </div>

            {/* План отправки — баннер сверху */}
            <div
              className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${
                !data.route_date || !data.departure_time
                  ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
                  : "border-border bg-secondary/40"
              }`}
            >
              <div className="flex items-center gap-2 text-sm">
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-foreground">План отправки:</span>
                {data.route_date ? (
                  <span>{new Date(data.route_date).toLocaleDateString("ru-RU")}</span>
                ) : (
                  <span className="italic text-muted-foreground">дата не указана</span>
                )}
                {data.departure_time ? (
                  <span className="font-mono">{data.departure_time.slice(0, 5)}</span>
                ) : (
                  <span className="italic text-muted-foreground">время не указано</span>
                )}
                {(!data.route_date || !data.departure_time) && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Не указано время отправки
                  </span>
                )}
              </div>
              <span
                className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGE_CLASS[data.request_priority]}`}
              >
                {PRIORITY_LABELS[data.request_priority]}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field icon={<Tag className="h-4 w-4" />} label="Тип заявки">
                {REQUEST_TYPE_LABELS[data.request_type] ?? data.request_type}
              </Field>
              <Field icon={<Calendar className="h-4 w-4" />} label="Дата отправки">
                {new Date(data.route_date).toLocaleDateString("ru-RU")}
              </Field>
            </div>

            <RequestSchedulingBlock
              requestId={data.id}
              routeDate={data.route_date}
              departureTime={data.departure_time}
              priority={data.request_priority}
            />

            <RequestWarehousesEditor
              requestId={data.id}
              requestType={data.request_type}
              warehouseId={data.warehouse_id}
              destinationWarehouseId={data.destination_warehouse_id}
            />


            <RequestTotalsCards requestId={data.id} />

            <TransportRequirementsBlock
              requestId={data.id}
              initial={{
                required_body_type: data.required_body_type,
                required_capacity_kg: data.required_capacity_kg,
                required_volume_m3: data.required_volume_m3,
                required_body_length_m: data.required_body_length_m,
                requires_tent: data.requires_tent,
                requires_manipulator: data.requires_manipulator,
                requires_straps: data.requires_straps,
                transport_comment: data.transport_comment,
              }}
            />

            <TransportCapacityCheck
              requestId={data.id}
              requiredCapacityKg={data.required_capacity_kg}
              requiredVolumeM3={data.required_volume_m3}
            />

            <TransportRequestStatusBlock
              requestId={data.id}
              current={data.request_status}
              changedBy={data.request_status_changed_by}
              changedAt={data.request_status_changed_at}
              comment={data.request_status_comment}
              ordersCount={totals?.count ?? 0}
              hasWarehouse={!!data.warehouse_id || data.request_type === "factory_to_warehouse"}
              hasDate={!!data.route_date}
              hasRequirements={
                !!data.required_body_type ||
                !!data.required_capacity_kg ||
                !!data.required_volume_m3 ||
                !!data.required_body_length_m
              }
              weightOver={
                data.required_capacity_kg != null &&
                (totals?.weight ?? 0) > data.required_capacity_kg
              }
              volumeOver={
                data.required_volume_m3 != null &&
                (totals?.volume ?? 0) > data.required_volume_m3
              }
            />


            <div className="rounded-lg border border-border p-4">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <MessageSquare className="h-3.5 w-3.5" />
                Комментарий
              </div>
              <div className="text-sm text-foreground">
                {data.comment || (
                  <span className="italic text-muted-foreground">Без комментария</span>
                )}
              </div>
            </div>

            {/* Заказы в заявке */}
            <RequestOrdersBlock requestId={data.id} />

            {/* Товары из заказов (структура 1С) */}
            <RequestOrderItemsBlock requestId={data.id} />

            {/* Список товаров к загрузке — агрегировано по товарам с проверкой остатков на складе */}
            <RequestLoadingListBlock
              requestId={data.id}
              warehouseId={data.warehouse_id}
            />

            {/* Резервирование товара под заявку */}
            <StockReservationBlock
              requestId={data.id}
              warehouseId={data.warehouse_id}
              routeNumber={data.route_number}
            />

            {/* Проверка наличия товара перед выдачей маршрута водителю */}
            <StockAvailabilityCheckBlock
              requestId={data.id}
              warehouseId={data.warehouse_id}
              routeNumber={data.route_number}
              onShortageChange={handleShortage}
            />

            {/* Создание маршрута на основе заявки */}
            <CreateRouteFromRequestBlock
              requestId={data.id}
              warehouseId={data.warehouse_id}
              routeDate={data.route_date}
              ordersCount={totals?.count ?? 0}
              blockedByShortage={hasShortage}
            />

            {/* Точки доставки */}
            <DeliveryPointsBlock requestId={data.id} />
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

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-3 text-center">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold text-foreground">{value}</div>
    </div>
  );
}
