import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGetAuth } from "@/lib/api-client";
import { CarrierRequestsBlock } from "@/components/carrier/CarrierRequestsBlock";
import { CarrierTripProgressBlock } from "@/components/carrier/CarrierTripProgressBlock";
import { CarrierDocumentsBlock } from "@/components/carrier/CarrierDocumentsBlock";
import {
  DEAL_STATUS_LABELS,
  type DealStatus,
  statusBadgeClass,
} from "@/lib/dispatcher/statuses";

export const Route = createFileRoute("/carrier/trips")({
  head: () => ({ meta: [{ title: "Задания и рейсы — кабинет перевозчика" }] }),
  component: CarrierTripsPage,
});

type Trip = {
  id: string;
  route_number: string;
  route_date: string;
  status: string;
  current_stage: string;
  assigned_driver: string | null;
  assigned_vehicle: string | null;
  driver_id: string | null;
  arrived_loading_at: string | null;
  loaded_at: string | null;
  departed_at: string | null;
  finished_at: string | null;
  driver: { id: string; full_name: string | null; phone: string | null } | null;
};

type Deal = {
  id: string;
  deal_number: string | null;
  route_from: string | null;
  route_to: string | null;
  loading_date: string | null;
  unloading_date: string | null;
  total_rate: number | string | null;
  commission_amount: number | string | null;
  deal_status: string;
  driver_name: string | null;
  driver_phone: string | null;
  vehicle_kind: string | null;
  vehicle_body_type: string | null;
  vehicle_plate: string | null;
  source_request_number: string | null;
  comment: string | null;
  carrier_comment: string | null;
  loading_started_at: string | null;
  in_transit_at: string | null;
  unloading_started_at: string | null;
  delivered_at: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  formed: "Сформирован",
  in_progress: "В пути",
  completed: "Завершён",
  cancelled: "Отменён",
};

const STAGE_LABEL: Record<string, string> = {
  not_started: "Не начат",
  going_to_loading: "Едет на загрузку",
  at_loading: "На загрузке",
  loaded: "Загружен",
  in_transit: "В рейсе",
  finished: "Завершён",
};

function CarrierTripsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["carrier", "trips"],
    queryFn: () => apiGetAuth<{ rows: Trip[] }>("/api/carrier/trips", 15000),
  });
  const dealsQ = useQuery({
    queryKey: ["carrier", "deals"],
    queryFn: () => apiGetAuth<{ rows: Deal[] }>("/api/carrier/deals", 15000),
  });
  const trips = data?.rows ?? [];
  const deals = dealsQ.data?.rows ?? [];

  return (
    <div className="space-y-4">
      <CarrierRequestsBlock />

      <h2 className="text-lg font-medium">Сделки и рейсы</h2>
      <p className="text-sm text-muted-foreground">
        Сделки, оформленные диспетчером по принятым заявкам.
      </p>

      {dealsQ.isLoading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка…
        </div>
      ) : deals.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Пока нет сделок.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {deals.map((d) => (
            <Card key={d.id}>
              <CardContent className="space-y-1.5 p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="font-semibold">
                    Сделка {d.deal_number ?? d.id.slice(0, 8)}
                    {d.source_request_number && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        (из заявки {d.source_request_number})
                      </span>
                    )}
                  </div>
                  <Badge variant="outline" className={statusBadgeClass(d.deal_status)}>
                    {DEAL_STATUS_LABELS[d.deal_status as DealStatus] ?? d.deal_status}
                  </Badge>
                </div>
                <div className="grid gap-1 text-xs sm:grid-cols-2">
                  <div>
                    <span className="text-muted-foreground">Маршрут: </span>
                    {(d.route_from ?? "—") + " → " + (d.route_to ?? "—")}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Даты: </span>
                    {(d.loading_date ?? "—") + " / " + (d.unloading_date ?? "—")}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Ставка: </span>
                    {d.total_rate ?? "—"} ₽
                  </div>
                  <div>
                    <span className="text-muted-foreground">Комиссия: </span>
                    {d.commission_amount ?? "—"} ₽
                  </div>
                  <div>
                    <span className="text-muted-foreground">Водитель: </span>
                    {d.driver_name ?? "—"}
                    {d.driver_phone ? ` · ${d.driver_phone}` : ""}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Транспорт: </span>
                    {[d.vehicle_kind, d.vehicle_body_type, d.vehicle_plate]
                      .filter(Boolean)
                      .join(" / ") || "—"}
                  </div>
                </div>
                {d.comment && (
                  <div className="rounded-md border bg-muted/30 p-2 text-xs whitespace-pre-wrap">
                    <span className="font-semibold">Диспетчер: </span>
                    {d.comment}
                  </div>
                )}
                <CarrierTripProgressBlock
                  deal={{
                    id: d.id,
                    deal_status: d.deal_status,
                    loading_started_at: d.loading_started_at,
                    in_transit_at: d.in_transit_at,
                    unloading_started_at: d.unloading_started_at,
                    delivered_at: d.delivered_at,
                    carrier_comment: d.carrier_comment,
                  }}
                />

              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <h2 className="text-lg font-medium">Задания и рейсы</h2>
      <p className="text-sm text-muted-foreground">
        Маршруты, закреплённые за вашими водителями и транспортом. Сам маршрут водитель
        выполняет по существующей схеме.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка…
        </div>
      ) : trips.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <ClipboardList className="h-8 w-8" />
            <div>Пока нет назначенных рейсов.</div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {trips.map((t) => (
            <Card key={t.id}>
              <CardContent className="space-y-1.5 p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="text-base font-semibold">
                    Рейс {t.route_number}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {t.route_date}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline">
                      {STATUS_LABEL[t.status] ?? t.status}
                    </Badge>
                    <Badge variant="secondary">
                      {STAGE_LABEL[t.current_stage] ?? t.current_stage}
                    </Badge>
                  </div>
                </div>
                <div className="text-xs">
                  Водитель:{" "}
                  <span className="font-medium">
                    {t.driver?.full_name ?? t.assigned_driver ?? "—"}
                  </span>
                  {t.driver?.phone ? ` · ${t.driver.phone}` : ""}
                </div>
                {t.assigned_vehicle && (
                  <div className="text-xs">
                    Транспорт: <span className="font-medium">{t.assigned_vehicle}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
