import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGetAuth } from "@/lib/api-client";

export const Route = createFileRoute("/carrier/drivers")({
  head: () => ({ meta: [{ title: "Мои водители — кабинет перевозчика" }] }),
  component: CarrierDriversPage,
});

type Me = {
  ok: boolean;
  drivers: Array<{
    id: string;
    full_name: string;
    phone: string | null;
    is_active: boolean;
  }>;
};

function CarrierDriversPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["carrier", "me"],
    queryFn: () => apiGetAuth<Me>("/api/carrier/me", 10000),
  });

  const drivers = data?.drivers ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Мои водители</h2>
        <Button
          onClick={() =>
            toast.info(
              "Многоразовая ссылка-приглашение водителя появится на следующем шаге.",
            )
          }
        >
          <UserPlus className="mr-2 h-4 w-4" /> Пригласить водителя
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка…
        </div>
      ) : drivers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <Users className="h-8 w-8" />
            <div>Пока нет привязанных водителей.</div>
            <div>
              Пригласите водителя по ссылке, чтобы он мог принимать рейсы от вашего
              имени.
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {drivers.map((d) => (
            <Card key={d.id}>
              <CardContent className="space-y-1 p-4 text-sm">
                <div className="flex items-center justify-between">
                  <div className="text-base font-semibold">{d.full_name}</div>
                  {d.is_active ? (
                    <Badge variant="outline">Активен</Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Не активен
                    </Badge>
                  )}
                </div>
                <div className="text-muted-foreground">{d.phone ?? "—"}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
