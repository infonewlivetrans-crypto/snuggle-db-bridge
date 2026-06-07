import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Loader2, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGetAuth } from "@/lib/api-client";
import { InviteDriverDialog } from "@/components/carrier/InviteDriverDialog";
import {
  DRIVER_STATUS_LABELS,
  statusBadgeClass,
} from "@/lib/dispatcher/statuses";

export const Route = createFileRoute("/carrier/drivers")({
  head: () => ({ meta: [{ title: "Мои водители — кабинет перевозчика" }] }),
  component: CarrierDriversPage,
});

type DriverRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  dispatcher_status: string;
  docs_status: string;
  vehicles: Array<{ id: string; vehicle_kind: string | null }>;
};

type Me = { ok: boolean; reason?: string; error?: string };

function CarrierDriversPage() {
  const [inviteOpen, setInviteOpen] = useState(false);

  const meQ = useQuery({
    queryKey: ["carrier", "me"],
    queryFn: () => apiGetAuth<Me>("/api/carrier/me", 10000),
    retry: false,
  });

  const notLinked =
    meQ.data &&
    !meQ.data.ok &&
    (meQ.data.reason === "no_carrier_linked" || meQ.data.error === "no_carrier_linked");

  const { data, isLoading } = useQuery({
    queryKey: ["carrier", "drivers"],
    queryFn: () => apiGetAuth<{ rows: DriverRow[] }>("/api/carrier/drivers", 10000),
    enabled: meQ.data?.ok === true,
  });
  const drivers = data?.rows ?? [];

  if (meQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка…
      </div>
    );
  }

  if (notLinked) {
    return (
      <Card>
        <CardContent className="space-y-2 py-10 text-center text-sm">
          <div className="flex items-center justify-center text-amber-600">
            <AlertCircle className="mr-2 h-5 w-5" />
            <span className="font-medium">Кабинет перевозчика ещё не активирован</span>
          </div>
          <p className="text-muted-foreground">
            Сначала создайте ссылку активации в карточке перевозчика у диспетчера.
            После того как перевозчик войдёт по ссылке, здесь можно будет приглашать водителей.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Мои водители</h2>
        <Button onClick={() => setInviteOpen(true)}>
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
              Нажмите «Пригласить водителя» — получите <strong>ссылку водителю</strong> и
              отправьте её. По ссылке он сам зарегистрируется и попадёт в ваш список.
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {drivers.map((d) => (
            <Card key={d.id}>
              <CardContent className="space-y-1.5 p-4 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-base font-semibold">{d.full_name ?? "—"}</div>
                  <Badge variant="outline" className={statusBadgeClass(d.dispatcher_status)}>
                    {DRIVER_STATUS_LABELS[d.dispatcher_status as keyof typeof DRIVER_STATUS_LABELS] ??
                      d.dispatcher_status}
                  </Badge>
                </div>
                <div className="text-muted-foreground">{d.phone ?? "—"}</div>
                {d.email && <div className="text-xs text-muted-foreground">{d.email}</div>}
                {d.city && <div className="text-xs">Город: {d.city}</div>}
                <div className="text-xs">
                  Документы:{" "}
                  <span className="font-medium">
                    {d.docs_status === "verified"
                      ? "проверены"
                      : d.docs_status === "uploaded"
                        ? "загружены"
                        : d.docs_status === "rejected"
                          ? "отклонены"
                          : "не загружены"}
                  </span>
                </div>
                {d.vehicles.length > 0 && (
                  <div className="text-xs">
                    Транспорт:{" "}
                    <span className="font-medium">
                      {d.vehicles.map((v) => v.vehicle_kind ?? "—").join(", ")}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <InviteDriverDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}
