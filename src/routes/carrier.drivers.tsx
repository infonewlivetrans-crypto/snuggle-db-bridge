import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGetAuth } from "@/lib/api-client";

export const Route = createFileRoute("/carrier/drivers")({
  head: () => ({ meta: [{ title: "Мои водители — кабинет перевозчика" }] }),
  component: CarrierDriversPage,
});

type Driver = {
  id: string;
  full_name: string | null;
  phone: string | null;
  license_number: string | null;
  license_categories: string | null;
  is_active: boolean | null;
};

function CarrierDriversPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["carrier", "drivers"],
    queryFn: () => apiGetAuth<{ rows: Driver[] }>("/api/carrier/drivers", 10000),
  });
  const drivers = data?.rows ?? [];

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-medium">Мои водители</h2>
      <p className="text-sm text-muted-foreground">
        Список водителей, закреплённых за вашей карточкой перевозчика. Водители работают
        по существующей схеме — маршрут, точки, статусы.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка…
        </div>
      ) : drivers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <Users className="h-8 w-8" />
            <div>Пока нет привязанных водителей.</div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {drivers.map((d) => (
            <Card key={d.id}>
              <CardContent className="space-y-1.5 p-4 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-base font-semibold">{d.full_name ?? "—"}</div>
                  <Badge variant={d.is_active ? "outline" : "secondary"}>
                    {d.is_active ? "Активен" : "Не активен"}
                  </Badge>
                </div>
                <div className="text-muted-foreground">{d.phone ?? "—"}</div>
                {d.license_number && (
                  <div className="text-xs">
                    ВУ: <span className="font-medium">{d.license_number}</span>
                    {d.license_categories ? ` (${d.license_categories})` : ""}
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
