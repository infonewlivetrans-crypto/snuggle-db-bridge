import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Save,
  X,
  Printer,
  PlusCircle,
  Hash,
  Calendar,
  Check,
  AlertTriangle,
  Upload,
} from "lucide-react";
import { RouteSheetImportWizard } from "@/components/RouteSheetImportWizard";
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
import { CarrierOffersBlockForRoute } from "@/components/CarrierOffersBlock";
import { CarrierConfirmationBlock } from "@/components/CarrierConfirmationBlock";
import { CarrierPaymentBlock } from "@/components/CarrierPaymentBlock";
import { CarrierDocumentsBlock } from "@/components/CarrierDocumentsBlock";
import { CarrierPayoutBlock } from "@/components/CarrierPayoutBlock";

import {
  TransportRequestStatusBlock,
  type RequestStatus,
} from "@/components/TransportRequestStatusBlock";
import { RequestSchedulingBlock } from "@/components/RequestSchedulingBlock";
import { DeliveryPointsBlock } from "@/components/DeliveryPointsBlock";
import { ContactsCard, useRouteContacts } from "@/components/ContactsCard";
import { CreateRouteFromRequestBlock } from "@/components/CreateRouteFromRequestBlock";
import {
  PRIORITY_LABELS,
  PRIORITY_BADGE_CLASS,
  type RequestPriority,
} from "@/lib/requestPriority";
import type { BodyType } from "@/lib/carriers";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/transport-requests/$requestId")({
  head: () => ({
    meta: [
      { title: "Заявка на транспорт — Радиус Трек" },
      { name: "description", content: "Карточка заявки на транспорт в стиле 1С" },
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
  source_warehouse?: { name: string; city: string | null; address?: string | null } | null;
  destination_warehouse?: { name: string; city: string | null; address?: string | null } | null;
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
  created_at: string;
  carrier_assignment_status: string;
  driver_id: string | null;
  carrier_id: string | null;
  carrier_payment_status: string | null;
  carrier_payout_status: string | null;
  organization: string | null;
  transport_kind: string | null;
  unloading_zone: string | null;
  carrier?: { company_name: string | null } | null;
  driver?: { full_name: string | null; phone: string | null } | null;
  vehicle?: { plate_number: string | null; brand: string | null; model: string | null } | null;
};

const STAGES = [
  { key: "created", label: "Создана" },
  { key: "warehouse", label: "В работе у склада" },
  { key: "vehicle_set", label: "ТС установлено" },
  { key: "shipped", label: "Отгружена" },
  { key: "to_pay", label: "К оплате" },
  { key: "paid", label: "Оплачена" },
] as const;

function computeStageIndex(d: RequestDetail): number {
  if (d.carrier_payout_status === "paid") return 5;
  if (
    d.carrier_payment_status === "to_pay" ||
    d.carrier_payment_status === "approved" ||
    d.status === "completed"
  )
    return 4;
  if (d.status === "in_progress" || d.status === "completed") return 3;
  if (d.carrier_assignment_status === "assigned" || d.driver_id) return 2;
  if (d.warehouse_id || d.request_status !== "draft") return 1;
  return 0;
}

function TransportRequestDetailPage() {
  const { requestId } = Route.useParams();
  const navigate = useNavigate();
  const [hasShortage, setHasShortage] = useState(false);
  const [whStatus, setWhStatus] = useState<RequestWarehouseStatus | null>(null);
  const [tab, setTab] = useState("orders");
  const [importOpen, setImportOpen] = useState(false);
  const handleShortage = useCallback((v: boolean) => setHasShortage(v), []);
  const handleWhStatus = useCallback(
    (s: RequestWarehouseStatus | null) => setWhStatus(s),
    [],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["transport-request", requestId],
    queryFn: async (): Promise<RequestDetail | null> => {
      const { data, error } = await supabase
        .from("routes")
        .select(
          "id, route_number, request_type, status, route_date, departure_time, request_priority, comment, warehouse_id, destination_warehouse_id, points_count, total_weight_kg, total_volume_m3, required_body_type, required_capacity_kg, required_volume_m3, required_body_length_m, requires_tent, requires_manipulator, requires_straps, transport_comment, request_status, request_status_changed_by, request_status_changed_at, request_status_comment, created_at, carrier_assignment_status, driver_id, carrier_id, carrier_payment_status, carrier_payout_status, organization, transport_kind, unloading_zone, source_warehouse:warehouse_id(name, city, address), destination_warehouse:destination_warehouse_id(name, city, address), carrier:carrier_id(company_name), driver:driver_id(full_name, phone), vehicle:vehicle_id(plate_number, brand, model)",
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

  const stageIndex = useMemo(() => (data ? computeStageIndex(data) : 0), [data]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
        <Link to="/transport-requests">
          <Button variant="ghost" size="sm" className="mb-3 gap-1.5">
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
          <div className="space-y-4">
            {/* Toolbar — 1С-style */}
            <div className="sticky top-0 z-10 -mx-3 border-b border-border bg-card/95 px-3 py-2 backdrop-blur sm:mx-0 sm:rounded-lg sm:border sm:px-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" className="gap-1.5">
                  <Save className="h-4 w-4" /> Сохранить
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-1.5"
                  onClick={() => navigate({ to: "/transport-requests" })}
                >
                  <Check className="h-4 w-4" />
                  <span className="hidden sm:inline">Сохранить и закрыть</span>
                  <span className="sm:hidden">Закрыть</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => window.print()}
                >
                  <Printer className="h-4 w-4" /> Печать
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <PlusCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">Создать заявку в подразделение</span>
                  <span className="sm:hidden">В подразделение</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setImportOpen(true)}
                >
                  <Upload className="h-4 w-4" />
                  <span className="hidden sm:inline">Загрузить маршрутный лист</span>
                  <span className="sm:hidden">Маршрутный лист</span>
                </Button>
                <RouteSheetImportWizard open={importOpen} onOpenChange={setImportOpen} />
                <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Hash className="h-3.5 w-3.5" />
                    <span className="font-mono font-semibold text-foreground">
                      {data.route_number}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(data.created_at).toLocaleDateString("ru-RU")}
                  </span>
                </div>
              </div>
            </div>

            {/* Status stepper */}
            <StatusStepper currentIndex={stageIndex} />

            {/* Plan banner */}
            <div
              className={cn(
                "flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-sm",
                !data.route_date || !data.departure_time
                  ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
                  : "border-border bg-secondary/40",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">План отправки:</span>
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
                  <span className="inline-flex items-center gap-1 text-xs text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Не указано время отправки
                  </span>
                )}
              </div>
              <span
                className={cn(
                  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
                  PRIORITY_BADGE_CLASS[data.request_priority],
                )}
              >
                {PRIORITY_LABELS[data.request_priority]}
              </span>
            </div>

            {/* Section: Основное */}
            <Section title="Основное">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Номер заявки" value={data.route_number} mono />
                <Field
                  label="Дата"
                  value={new Date(data.route_date).toLocaleDateString("ru-RU")}
                />
                <Field
                  label="Вид заявки"
                  value={REQUEST_TYPE_LABELS[data.request_type] ?? data.request_type}
                />
                <Field
                  label="Транспорт"
                  value={
                    data.transport_kind === "own"
                      ? "Собственный"
                      : data.transport_kind === "hired"
                        ? "Наёмный"
                        : data.carrier_id
                          ? "Наёмный"
                          : "—"
                  }
                />
                <Field label="Организация" value={data.organization || "—"} />
                <Field
                  label="Перевозчик"
                  value={data.carrier?.company_name ?? "—"}
                />
              </div>
              <div className="mt-3 rounded-lg border border-border p-3">
                <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Комментарий
                </div>
                <div className="text-sm">
                  {data.comment || (
                    <span className="italic text-muted-foreground">Без комментария</span>
                  )}
                </div>
              </div>
            </Section>

            {/* Section: Загрузка / выгрузка */}
            <Section title="Загрузка / выгрузка / печать">
              <RequestSchedulingBlock
                requestId={data.id}
                routeDate={data.route_date}
                departureTime={data.departure_time}
                priority={data.request_priority}
              />
              <div className="mt-3">
                <RequestWarehousesEditor
                  requestId={data.id}
                  requestType={data.request_type}
                  warehouseId={data.warehouse_id}
                  destinationWarehouseId={data.destination_warehouse_id}
                />
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field
                  label="Адрес загрузки"
                  value={data.source_warehouse?.address || data.source_warehouse?.name || "—"}
                />
                <Field
                  label="Адрес выгрузки"
                  value={
                    data.destination_warehouse?.address ||
                    data.destination_warehouse?.name ||
                    "—"
                  }
                />
                <Field label="Зона выгрузки" value={data.unloading_zone || "—"} />
              </div>
              {(!data.warehouse_id || !data.route_date) && (
                <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Есть ограничения по редактированию: укажите склад и дату отправки
                </div>
              )}
            </Section>

            {/* Section: Плановые параметры ТС */}
            <Section title="Плановые параметры ТС">
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
              <div className="mt-3">
                <TransportCapacityCheck
                  requestId={data.id}
                  requiredCapacityKg={data.required_capacity_kg}
                  requiredVolumeM3={data.required_volume_m3}
                />
              </div>
              <div className="mt-3">
                <RequestTotalsCards requestId={data.id} />
              </div>
            </Section>

            {/* Tabs */}
            <Tabs value={tab} onValueChange={setTab} className="w-full">
              <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
                <TabsList className="inline-flex w-max min-w-full justify-start">
                  <TabsTrigger value="orders">Заказы клиентов</TabsTrigger>
                  <TabsTrigger value="hired">Наёмный транспорт и водитель</TabsTrigger>
                  <TabsTrigger value="payment">Данные для оплаты рейса</TabsTrigger>
                  <TabsTrigger value="docs">Документы / Затраты</TabsTrigger>
                  <TabsTrigger value="warehouse">Склад / Резерв</TabsTrigger>
                  <TabsTrigger value="contacts">Контакты</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="orders" className="space-y-4 pt-4">
                <RequestOrdersBlock requestId={data.id} />
                <RequestOrderItemsBlock requestId={data.id} />
                <RequestLoadingListBlock
                  requestId={data.id}
                  warehouseId={data.warehouse_id}
                />
                <DeliveryPointsBlock requestId={data.id} />
              </TabsContent>

              <TabsContent value="hired" className="space-y-4 pt-4">
                <CarrierConfirmationBlock routeId={data.id} />
                <CarrierOffersBlockForRoute routeId={data.id} />
                <Section title="Наёмный транспорт и водитель">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Перевозчик" value={data.carrier?.company_name ?? "—"} />
                    <Field label="Водитель" value={data.driver?.full_name ?? "—"} />
                    <Field label="Телефон водителя" value={data.driver?.phone ?? "—"} />
                    <Field
                      label="Машина"
                      value={
                        data.vehicle
                          ? `${data.vehicle.brand ?? ""} ${data.vehicle.model ?? ""}`.trim() ||
                            "—"
                          : "—"
                      }
                    />
                    <Field label="Госномер" value={data.vehicle?.plate_number ?? "—"} mono />
                    <Field label="Прицеп" value="—" />
                  </div>
                </Section>
              </TabsContent>

              <TabsContent value="payment" className="space-y-4 pt-4">
                <CarrierPaymentBlock routeId={data.id} />
                <CarrierPayoutBlock routeId={data.id} />
              </TabsContent>

              <TabsContent value="docs" className="space-y-4 pt-4">
                <CarrierDocumentsBlock routeId={data.id} mode="logist" />
              </TabsContent>

              <TabsContent value="warehouse" className="space-y-4 pt-4">
                <StockReservationBlock
                  requestId={data.id}
                  warehouseId={data.warehouse_id}
                  routeNumber={data.route_number}
                />
                <StockAvailabilityCheckBlock
                  requestId={data.id}
                  warehouseId={data.warehouse_id}
                  routeNumber={data.route_number}
                  onShortageChange={handleShortage}
                />
                <RequestWarehouseStatusBlock
                  requestId={data.id}
                  warehouseId={data.warehouse_id}
                  onStatusChange={handleWhStatus}
                />
                <CreateRouteFromRequestBlock
                  requestId={data.id}
                  warehouseId={data.warehouse_id}
                  routeDate={data.route_date}
                  ordersCount={totals?.count ?? 0}
                  blockedByShortage={hasShortage}
                  blockedByWarehouseStatus={
                    !!whStatus && !REQ_WH_STATUS_OK_FOR_DRIVER.includes(whStatus)
                  }
                  warehouseStatusLabel={
                    whStatus ? REQ_WH_STATUS_LABELS[whStatus] : undefined
                  }
                />
                <TransportRequestStatusBlock
                  requestId={data.id}
                  current={data.request_status}
                  changedBy={data.request_status_changed_by}
                  changedAt={data.request_status_changed_at}
                  comment={data.request_status_comment}
                  ordersCount={totals?.count ?? 0}
                  hasWarehouse={
                    !!data.warehouse_id || data.request_type === "factory_to_warehouse"
                  }
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
              </TabsContent>

              <TabsContent value="contacts" className="pt-4">
                <RequestContactsBlock requestId={data.id} />
              </TabsContent>
            </Tabs>

            <div className="text-xs text-muted-foreground">
              Текущий статус заявки:{" "}
              <Badge variant="outline">
                {REQUEST_STATUS_LABELS[data.status] ?? data.status}
              </Badge>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function StatusStepper({ currentIndex }: { currentIndex: number }) {
  return (
    <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
      <ol className="flex w-max min-w-full items-center gap-1 rounded-lg border border-border bg-card p-2 sm:gap-2">
        {STAGES.map((s, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          return (
            <li key={s.key} className="flex items-center gap-1 sm:gap-2">
              <div
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-1 text-xs font-medium sm:text-sm",
                  active && "border-primary bg-primary/10 text-primary",
                  done && "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200",
                  !active && !done && "border-border bg-muted/30 text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                    active && "bg-primary text-primary-foreground",
                    done && "bg-emerald-600 text-white",
                    !active && !done && "bg-muted text-muted-foreground",
                  )}
                >
                  {done ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                {s.label}
              </div>
              {i < STAGES.length - 1 && (
                <div className="h-px w-3 bg-border sm:w-5" />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="border-b border-border px-3 py-2 sm:px-4">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </header>
      <div className="p-3 sm:p-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-2.5">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "break-words text-sm font-medium text-foreground",
          mono && "font-mono",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function RequestContactsBlock({ requestId }: { requestId: string }) {
  const { data, isLoading } = useRouteContacts({ routeId: requestId });
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        Загрузка контактов…
      </div>
    );
  }
  return <ContactsCard contacts={data ?? []} title="Контакты по заявке" />;
}
