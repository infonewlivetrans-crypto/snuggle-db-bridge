import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Truck, Hash, Calendar, ChevronRight, User, MapPin } from "lucide-react";
import {
  DELIVERY_ROUTE_STATUS_LABELS,
  DELIVERY_ROUTE_STATUS_STYLES,
  type DeliveryRouteStatus,
} from "@/lib/deliveryRoutes";

export const Route = createFileRoute("/carrier-routes")({
  head: () => ({
    meta: [
      { title: "Мои рейсы — Радиус Трек" },
      { name: "description", content: "Назначенные перевозчику рейсы — активные и завершённые" },
    ],
  }),
  component: CarrierRoutesPage,
});

type Row = {
  id: string;
  route_number: string;
  route_date: string;
  status: DeliveryRouteStatus;
  assigned_driver: string | null;
  assigned_vehicle: string | null;
  source_request_id: string;
  carrier_id: string | null;
};

const ACTIVE_STATUSES: DeliveryRouteStatus[] = ["formed", "issued", "in_progress"];
const FINISHED_STATUSES: DeliveryRouteStatus[] = ["completed", "cancelled"];

function CarrierRoutesPage() {
  const { profile } = useAuth();
  const carrierId = profile?.carrier_id ?? null;
  const [tab, setTab] = useState<"active" | "finished">("active");

  const { data, isLoading, error } = useQuery({
    enabled: !!carrierId,
    queryKey: ["carrier-routes", carrierId],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("delivery_routes")
        .select(
          "id, route_number, route_date, status, assigned_driver, assigned_vehicle, source_request_id, carrier_id",
        )
        .eq("carrier_id", carrierId!)
        .order("route_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const active = useMemo(
    () => (data ?? []).filter((r) => ACTIVE_STATUSES.includes(r.status)),
    [data],
  );
  const finished = useMemo(
    () => (data ?? []).filter((r) => FINISHED_STATUSES.includes(r.status)),
    [data],
  );

  const list = tab === "active" ? active : finished;

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <Truck className="h-5 w-5 text-primary" />
          <span className="font-semibold">Мои рейсы</span>
        </div>
      </div>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
        {!carrierId ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              Профиль не связан с перевозчиком. Обратитесь к администратору.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="inline-flex rounded-lg border border-border bg-card p-1">
              <button
                onClick={() => setTab("active")}
                className={`rounded-md px-4 py-1.5 text-sm font-medium ${
                  tab === "active"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                Активные ({active.length})
              </button>
              <button
                onClick={() => setTab("finished")}
                className={`rounded-md px-4 py-1.5 text-sm font-medium ${
                  tab === "finished"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                Завершённые ({finished.length})
              </button>
            </div>

            {isLoading ? (
              <div className="text-muted-foreground">Загрузка…</div>
            ) : error ? (
              <Card>
                <CardContent className="p-6 text-center text-destructive">
                  Ошибка загрузки: {(error as Error).message}
                </CardContent>
              </Card>
            ) : list.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  {tab === "active" ? "Активных рейсов нет" : "Завершённых рейсов нет"}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {list.map((r) => (
                  <Link
                    key={r.id}
                    to="/driver/$deliveryRouteId"
                    params={{ deliveryRouteId: r.id }}
                    className="block"
                  >
                    <Card className="transition hover:border-primary/50 hover:shadow-sm">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="flex items-center gap-2 text-base">
                            <Hash className="h-4 w-4 text-muted-foreground" />
                            {r.route_number}
                          </CardTitle>
                          <Badge
                            variant="outline"
                            className={DELIVERY_ROUTE_STATUS_STYLES[r.status]}
                          >
                            {DELIVERY_ROUTE_STATUS_LABELS[r.status]}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-1.5 pb-3 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          {new Date(r.route_date).toLocaleDateString("ru-RU")}
                        </div>
                        {r.assigned_driver && (
                          <div className="flex items-center gap-2">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{r.assigned_driver}</span>
                          </div>
                        )}
                        {r.assigned_vehicle && (
                          <div className="flex items-center gap-2">
                            <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{r.assigned_vehicle}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-end pt-1 text-xs text-primary">
                          Открыть маршрут <ChevronRight className="ml-1 h-3.5 w-3.5" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
