import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGetAuth } from "@/lib/api-client";

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
  const trips = data?.rows ?? [];

  return (
    <div className="space-y-3">
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
