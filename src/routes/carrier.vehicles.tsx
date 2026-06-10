import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Truck, UserX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { apiGetAuth } from "@/lib/api-client";
import { StatusBadge } from "@/components/dispatcher/StatusBadge";
import {
  LOAD_METHOD_LABELS,
  VEHICLE_FEATURE_LABELS,
  type LoadMethod,
  type VehicleFeature,

} from "@/lib/dispatcher/statuses";

export const Route = createFileRoute("/carrier/vehicles")({
  head: () => ({ meta: [{ title: "Мой транспорт — кабинет перевозчика" }] }),
  component: CarrierVehiclesPage,
});

type Vehicle = {
  id: string;
  plate_number: string;
  vehicle_kind: string | null;
  body_type: string | null;
  capacity_kg: number | null;
  payload_kg: number | null;
  volume_m3: number | null;
  body_length_m: number | null;
  body_width_m: number | null;
  body_height_m: number | null;
  home_city: string | null;
  ready_date: string | null;
  load_methods: string[] | null;
  dispatcher_status: string | null;
  comment: string | null;
  is_active: boolean | null;
  driver_id: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  source: "production" | "dispatcher";
};

const READY = new Set(["ready_to_work", "available", "free"]);

function bodyTypeLabel(b: string | null): string {
  if (!b) return "—";
  return (VEHICLE_BODY_TYPE_LABELS as Record<string, string>)[b] ?? b;
}

function statusLabel(s: string | null): string {
  if (!s) return "—";
  return (VEHICLE_STATUS_LABELS as Record<string, string>)[s] ?? s;
}

function featuresLabel(arr: string[] | null): string {
  if (!arr || arr.length === 0) return "";
  return arr
    .map(
      (x) =>
        (LOAD_METHOD_LABELS as Record<string, string>)[x as LoadMethod] ??
        (VEHICLE_FEATURE_LABELS as Record<string, string>)[x as VehicleFeature] ??
        x,
    )
    .join(" · ");
}

function CarrierVehiclesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["carrier", "vehicles"],
    queryFn: () => apiGetAuth<{ rows: Vehicle[] }>("/api/carrier/vehicles", 10000),
  });
  const vehicles = data?.rows ?? [];

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-medium">Мой транспорт</h2>
      <p className="text-sm text-muted-foreground">
        Список транспорта закреплён за вашей карточкой перевозчика. Изменения вносит
        администратор/диспетчер.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка…
        </div>
      ) : vehicles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <Truck className="h-8 w-8" />
            <div>Пока нет привязанного транспорта.</div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {vehicles.map((v) => {
            const ready = READY.has(v.dispatcher_status ?? "") && !!v.driver_id;
            return (
              <Card key={v.id}>
                <CardContent className="space-y-1.5 p-4 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-base font-semibold">
                      {bodyTypeLabel(v.body_type)}
                      {v.vehicle_kind ? (
                        <span className="ml-2 text-muted-foreground font-normal">
                          {v.vehicle_kind}
                        </span>
                      ) : v.plate_number && v.plate_number !== "—" ? (
                        <span className="ml-2 text-muted-foreground font-normal">
                          {v.plate_number}
                        </span>
                      ) : null}
                    </div>
                    {v.dispatcher_status ? (
                      <StatusBadge
                        status={v.dispatcher_status}
                        label={statusLabel(v.dispatcher_status)}
                      />
                    ) : null}
                  </div>
                  <div className="text-muted-foreground">
                    {v.payload_kg != null || v.capacity_kg != null
                      ? `${v.payload_kg ?? v.capacity_kg} кг`
                      : "—"}
                    {v.volume_m3 != null ? ` · ${v.volume_m3} м³` : ""}
                    {v.home_city ? ` · ${v.home_city}` : ""}
                  </div>
                  {(v.body_length_m || v.body_width_m || v.body_height_m) && (
                    <div className="text-xs text-muted-foreground">
                      Габариты: {v.body_length_m ?? "?"}×{v.body_width_m ?? "?"}×
                      {v.body_height_m ?? "?"} м
                    </div>
                  )}
                  {featuresLabel(v.load_methods) && (
                    <div className="text-xs text-muted-foreground">
                      {featuresLabel(v.load_methods)}
                    </div>
                  )}
                  <div className="text-xs">
                    {v.driver_id ? (
                      <span>
                        Водитель: <span className="font-medium">{v.driver_name ?? "—"}</span>
                        {v.driver_phone ? ` · ${v.driver_phone}` : ""}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                        <UserX className="h-3 w-3" /> Без водителя
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {ready ? "Готов к работе" : "Не готов к работе"}
                  </div>
                  {v.comment && (
                    <div className="text-xs text-muted-foreground">{v.comment}</div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
// touch type imports to keep tree-shaking happy
export type _t = VehicleStatus | VehicleBodyType;
