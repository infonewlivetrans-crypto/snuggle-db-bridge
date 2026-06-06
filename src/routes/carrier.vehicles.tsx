import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiGetAuth } from "@/lib/api-client";

export const Route = createFileRoute("/carrier/vehicles")({
  head: () => ({ meta: [{ title: "Мой транспорт — кабинет перевозчика" }] }),
  component: CarrierVehiclesPage,
});

type Me = {
  ok: boolean;
  vehicles: Array<{
    id: string;
    plate_number: string;
    brand: string | null;
    model: string | null;
    body_type: string;
    capacity_kg: number | null;
    volume_m3: number | null;
    is_active: boolean;
  }>;
};

function CarrierVehiclesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["carrier", "me"],
    queryFn: () => apiGetAuth<Me>("/api/carrier/me", 10000),
  });

  const vehicles = data?.vehicles ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Мой транспорт</h2>
        <Button
          onClick={() =>
            toast.info(
              "Форма добавления транспорта появится на следующем шаге. Сейчас обратитесь к диспетчеру.",
            )
          }
        >
          <Plus className="mr-2 h-4 w-4" /> Добавить транспорт
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка…
        </div>
      ) : vehicles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <Truck className="h-8 w-8" />
            <div>У вас пока нет добавленного транспорта.</div>
            <div>
              Добавьте машину, чтобы диспетчер мог подбирать вам подходящие грузы.
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {vehicles.map((v) => (
            <Card key={v.id}>
              <CardContent className="space-y-1 p-4 text-sm">
                <div className="text-base font-semibold">{v.plate_number}</div>
                <div className="text-muted-foreground">
                  {[v.brand, v.model].filter(Boolean).join(" ") || "—"}
                </div>
                <div>
                  Тип кузова: <span className="font-medium">{v.body_type}</span>
                </div>
                <div>
                  Грузоподъёмность:{" "}
                  <span className="font-medium">
                    {v.capacity_kg != null ? `${v.capacity_kg} кг` : "—"}
                  </span>
                </div>
                <div>
                  Объём:{" "}
                  <span className="font-medium">
                    {v.volume_m3 != null ? `${v.volume_m3} м³` : "—"}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
