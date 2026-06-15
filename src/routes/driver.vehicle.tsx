import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Truck, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiGetAuth } from "@/lib/api-client";
import { ReportReadinessBlock } from "@/components/carrier/ReportReadinessBlock";
import { getVehicleBodyTypeLabel } from "@/lib/dispatcher/vehicle-options";

/**
 * Кабинет водителя: моя машина и готовность.
 * Водитель сам указывает текущий город, готовность, направления и радиус —
 * без участия диспетчера.
 */

export const Route = createFileRoute("/driver/vehicle")({
  head: () => ({
    meta: [{ title: "Моя машина — кабинет водителя" }],
  }),
  component: DriverVehiclePage,
});

type MyVehicle = {
  id: string;
  vehicle_kind: string | null;
  body_type: string | null;
  payload_kg: number | null;
  volume_m3: number | null;
  home_city: string | null;
  current_city: string | null;
  location_updated_at: string | null;
  location_source: string | null;
  ready_to_cities: string[] | null;
  ready_date: string | null;
  ready_from: string | null;
  ready_comment: string | null;
  ready_radius_km: number | null;
  ready_mode: string | null;
  ready_weekdays: number[] | null;
  load_status: string | null;
  free_payload_kg: number | null;
  free_volume_m3: number | null;
  partial_route_from: string | null;
  partial_route_to: string | null;
  loading_restrictions: string | null;
};

function DriverVehiclePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["driver", "my-vehicle"],
    queryFn: () => apiGetAuth<{ row: MyVehicle | null }>("/api/driver/my-vehicle"),
  });
  const v = data?.row ?? null;

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <Link to="/driver">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <Truck className="h-5 w-5 text-primary" />
          <span className="font-semibold">Моя машина</span>
        </div>
      </div>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка…
          </div>
        ) : !v ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <Truck className="h-8 w-8" />
              <div>За вами пока не закреплена машина.</div>
              <div>Свяжитесь с перевозчиком или диспетчером.</div>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="space-y-1 p-4 text-sm">
                <div className="text-base font-semibold">
                  {getVehicleBodyTypeLabel(v.body_type) || v.vehicle_kind || "Машина"}
                </div>
                <div className="text-muted-foreground">
                  {v.payload_kg != null ? `${v.payload_kg} кг` : "—"}
                  {v.volume_m3 != null ? ` · ${v.volume_m3} м³` : ""}
                  {v.home_city ? ` · база ${v.home_city}` : ""}
                </div>
                {v.location_updated_at && (
                  <div className="text-xs text-muted-foreground">
                    Обновлено: {new Date(v.location_updated_at).toLocaleString("ru-RU")}
                    {v.location_source ? ` · источник: ${v.location_source}` : ""}
                  </div>
                )}
              </CardContent>
            </Card>

            <ReportReadinessBlock
              endpoint="/api/driver/my-vehicle"
              invalidateKey={["driver", "my-vehicle"]}
              defaultOpen
              initial={{
                current_city: v.current_city,
                ready_to_cities: v.ready_to_cities,
                ready_date: v.ready_date,
                ready_from: v.ready_from,
                ready_comment: v.ready_comment,
                ready_radius_km: v.ready_radius_km,
                ready_mode: v.ready_mode,
                ready_weekdays: v.ready_weekdays,
                load_status: v.load_status,
                free_payload_kg: v.free_payload_kg,
                free_volume_m3: v.free_volume_m3,
                partial_route_from: v.partial_route_from,
                partial_route_to: v.partial_route_to,
                loading_restrictions: v.loading_restrictions,
                location_updated_at: v.location_updated_at,
              }}
            />
          </>
        )}
      </main>
    </div>
  );
}
