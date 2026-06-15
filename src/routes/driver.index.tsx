import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGetAuth } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Truck, Hash, Calendar, MapPin, ChevronRight } from "lucide-react";
import {
  DELIVERY_ROUTE_STATUS_LABELS,
  DELIVERY_ROUTE_STATUS_STYLES,
  type DeliveryRouteStatus,
} from "@/lib/deliveryRoutes";

export const Route = createFileRoute("/driver/")({
  head: () => ({
    meta: [
      { title: "Мои маршруты — Радиус Трек" },
      { name: "description", content: "Список маршрутов водителя" },
    ],
  }),
  component: DriverRoutesListPage,
});

type Row = {
  id: string;
  route_number: string;
  route_date: string;
  status: DeliveryRouteStatus;
  assigned_driver: string | null;
  assigned_vehicle: string | null;
  source_request_id: string;
};

type Resp = { rows: Row[]; pointsCounts: Record<string, number> };

function DriverRoutesListPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["driver-my-routes"],
    queryFn: async (): Promise<Resp> => {
      return await apiGetAuth<Resp>("/api/driver/my-routes");
    },
  });

  const rows = data?.rows ?? [];
  const pointsCounts = data?.pointsCounts ?? {};

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <Truck className="h-5 w-5 text-primary" />
          <span className="font-semibold">Мои маршруты</span>
        </div>
      </div>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
        {isLoading ? (
          <div className="text-muted-foreground">Загрузка…</div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
            У вас пока нет назначенных маршрутов
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <Link
                key={r.id}
                to="/driver/$deliveryRouteId"
                params={{ deliveryRouteId: r.id }}
                className="block rounded-lg border border-border bg-card p-4 transition hover:border-primary/40 hover:bg-accent/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <Hash className="h-4 w-4 text-muted-foreground" />
                      {r.route_number}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(r.route_date).toLocaleDateString("ru-RU")}
                      </span>
                      {r.assigned_vehicle && (
                        <span className="inline-flex items-center gap-1">
                          <Truck className="h-3.5 w-3.5" />
                          {r.assigned_vehicle}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {pointsCounts[r.source_request_id] ?? 0} точек
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge variant="outline" className={DELIVERY_ROUTE_STATUS_STYLES[r.status]}>
                      {DELIVERY_ROUTE_STATUS_LABELS[r.status]}
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 pt-2">
          <Link to="/driver/vehicle">
            <Button variant="outline" size="sm" className="w-full">
              <Truck className="mr-1 h-3.5 w-3.5" /> Моя машина
            </Button>
          </Link>
          <Link to="/workspace">
            <Button variant="outline" size="sm" className="w-full">
              Профиль
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
