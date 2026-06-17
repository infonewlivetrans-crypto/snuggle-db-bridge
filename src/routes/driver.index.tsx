import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGetAuth } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Truck, Hash, Calendar, MapPin, ChevronRight, Package } from "lucide-react";
import {
  DELIVERY_ROUTE_STATUS_LABELS,
  DELIVERY_ROUTE_STATUS_STYLES,
  type DeliveryRouteStatus,
} from "@/lib/deliveryRoutes";
import {
  TRIP_STATUS_BADGE,
  TRIP_STATUS_LABEL,
  type TripStatus,
} from "@/lib/dispatcher/trip-status";

export const Route = createFileRoute("/driver/")({
  head: () => ({
    meta: [
      { title: "Мои задания — Радиус Трек" },
      { name: "description", content: "Активные задания и маршруты водителя" },
    ],
  }),
  component: DriverIndexPage,
});

type RouteRow = {
  id: string;
  route_number: string;
  route_date: string;
  status: DeliveryRouteStatus;
  assigned_driver: string | null;
  assigned_vehicle: string | null;
  source_request_id: string;
};
type RoutesResp = { rows: RouteRow[]; pointsCounts: Record<string, number> };

type TripRow = {
  id: string;
  status: TripStatus;
  cargo_summary: string | null;
  weight_kg: number | null;
  points_count: number;
  from_city: string | null;
  to_city: string | null;
};
type TripsResp = { rows: TripRow[] };

function DriverIndexPage() {
  const routes = useQuery({
    queryKey: ["driver-my-routes"],
    queryFn: () => apiGetAuth<RoutesResp>("/api/driver/my-routes"),
  });
  const trips = useQuery({
    queryKey: ["driver-trips"],
    queryFn: () => apiGetAuth<TripsResp>("/api/driver/trips"),
    refetchInterval: 30000,
  });

  const tripRows = trips.data?.rows ?? [];
  const activeTrips = tripRows.filter(
    (t) => t.status !== "delivered" && t.status !== "cancelled",
  );
  const routeRows = routes.data?.rows ?? [];
  const pointsCounts = routes.data?.pointsCounts ?? {};

  const nothing =
    !routes.isLoading &&
    !trips.isLoading &&
    activeTrips.length === 0 &&
    routeRows.length === 0;

  return (
    <div className="min-h-[100dvh] bg-background pb-[env(safe-area-inset-bottom)]">
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <Truck className="h-5 w-5 text-primary" />
          <span className="font-semibold">Мои задания</span>
        </div>
      </div>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-4">
        {/* Dispatcher trips */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Рейсы AI-диспетчера
          </h2>
          {trips.isLoading ? (
            <div className="text-sm text-muted-foreground">Загрузка…</div>
          ) : activeTrips.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card p-4 text-center text-sm text-muted-foreground">
              Пока нет активных рейсов. Когда диспетчер назначит рейс, он появится здесь.
            </div>
          ) : (
            activeTrips.map((t) => (
              <Link
                key={t.id}
                to="/driver/trip/$tripId"
                params={{ tripId: t.id }}
                className="block rounded-lg border border-border bg-card p-4 transition hover:border-primary/40 hover:bg-accent/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">
                      {t.from_city ?? "—"} → {t.to_city ?? "—"}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {t.points_count} точек
                      </span>
                      {t.weight_kg != null && (
                        <span className="inline-flex items-center gap-1">
                          <Package className="h-3.5 w-3.5" />
                          {t.weight_kg} кг
                        </span>
                      )}
                    </div>
                    {t.cargo_summary && (
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {t.cargo_summary}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge variant="outline" className={TRIP_STATUS_BADGE[t.status]}>
                      {TRIP_STATUS_LABEL[t.status]}
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </Link>
            ))
          )}
        </section>

        {/* Legacy warehouse routes — only if present */}
        {routeRows.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Складские маршруты
            </h2>
            {routeRows.map((r) => (
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
                    <Badge
                      variant="outline"
                      className={DELIVERY_ROUTE_STATUS_STYLES[r.status]}
                    >
                      {DELIVERY_ROUTE_STATUS_LABELS[r.status]}
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </Link>
            ))}
          </section>
        )}

        {nothing && (
          <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
            Пока нет активных заданий. Когда диспетчер назначит рейс, он появится здесь.
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
