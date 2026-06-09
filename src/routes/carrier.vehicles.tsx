import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Truck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGetAuth } from "@/lib/api-client";

export const Route = createFileRoute("/carrier/vehicles")({
  head: () => ({ meta: [{ title: "Мой транспорт — кабинет перевозчика" }] }),
  component: CarrierVehiclesPage,
});

type Vehicle = {
  id: string;
  plate_number: string;
  brand: string | null;
  model: string | null;
  body_type: string | null;
  capacity_kg: number | null;
  volume_m3: number | null;
  body_length_m: number | null;
  body_width_m: number | null;
  body_height_m: number | null;
  has_tent: boolean | null;
  has_straps: boolean | null;
  has_manipulator: boolean | null;
  comment: string | null;
  is_active: boolean | null;
};

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
          {vehicles.map((v) => (
            <Card key={v.id}>
              <CardContent className="space-y-1.5 p-4 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-base font-semibold">
                    {v.plate_number}
                    {v.brand || v.model ? (
                      <span className="ml-2 text-muted-foreground font-normal">
                        {[v.brand, v.model].filter(Boolean).join(" ")}
                      </span>
                    ) : null}
                  </div>
                  <Badge variant={v.is_active ? "outline" : "secondary"}>
                    {v.is_active ? "Активен" : "Не активен"}
                  </Badge>
                </div>
                <div className="text-muted-foreground">
                  Тип кузова: {v.body_type ?? "—"}
                  {v.capacity_kg != null ? ` · ${v.capacity_kg} кг` : ""}
                  {v.volume_m3 != null ? ` · ${v.volume_m3} м³` : ""}
                </div>
                {(v.body_length_m || v.body_width_m || v.body_height_m) && (
                  <div className="text-xs text-muted-foreground">
                    Габариты: {v.body_length_m ?? "?"}×{v.body_width_m ?? "?"}×
                    {v.body_height_m ?? "?"} м
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  {[
                    v.has_tent ? "тент" : null,
                    v.has_straps ? "ремни" : null,
                    v.has_manipulator ? "манипулятор" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </div>
                {v.comment && (
                  <div className="text-xs text-muted-foreground">{v.comment}</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
