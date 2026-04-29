import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Truck, Hash, Calendar, MapPin, ChevronRight, Search } from "lucide-react";
import { useState, useMemo } from "react";
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

function DriverRoutesListPage() {
  const [driver, setDriver] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("driver-name-filter") ?? "";
  });

  const { data, isLoading } = useQuery({
    queryKey: ["driver-routes-list", driver],
    queryFn: async (): Promise<Row[]> => {
      let q = supabase
        .from("delivery_routes")
        .select(
          "id, route_number, route_date, status, assigned_driver, assigned_vehicle, source_request_id",
        )
        .in("status", ["issued", "in_progress", "completed"])
        .order("route_date", { ascending: false })
        .limit(100);
      if (driver.trim()) q = q.ilike("assigned_driver", `%${driver.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const ids = useMemo(() => (data ?? []).map((r) => r.source_request_id), [data]);
  const { data: pointsCounts } = useQuery({
    enabled: ids.length > 0,
    queryKey: ["driver-routes-point-counts", ids.join(",")],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data: rows, error } = await supabase
        .from("route_points")
        .select("route_id")
        .in("route_id", ids);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of (rows ?? []) as Array<{ route_id: string }>) {
        map[r.route_id] = (map[r.route_id] ?? 0) + 1;
      }
      return map;
    },
  });

  const persistDriver = (val: string) => {
    setDriver(val);
    if (typeof window !== "undefined") {
      localStorage.setItem("driver-name-filter", val);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <Truck className="h-5 w-5 text-primary" />
          <span className="font-semibold">Мои маршруты</span>
        </div>
      </div>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Водитель
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={driver}
              onChange={(e) => persistDriver(e.target.value)}
              placeholder="Введите ФИО водителя"
              className="pl-9"
            />
          </div>
          <div className="mt-1.5 text-xs text-muted-foreground">
            Имя сохраняется на этом устройстве и используется для фильтра маршрутов.
          </div>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground">Загрузка…</div>
        ) : !data || data.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
            {driver ? "Маршрутов не найдено" : "Введите имя водителя, чтобы увидеть свои маршруты"}
          </div>
        ) : (
          <div className="space-y-3">
            {data.map((r) => (
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
                        {pointsCounts?.[r.source_request_id] ?? 0} точек
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

        <div className="pt-2">
          <Link to="/" search={{ orderId: undefined }}>
            <Button variant="outline" size="sm" className="w-full">
              На главную
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
