import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Users, Plus, Archive } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiDelete, apiGetAuth } from "@/lib/api-client";
import { DRIVER_STATUS_LABELS, type DriverStatus } from "@/lib/dispatcher/statuses";
import { StatusBadge } from "@/components/dispatcher/StatusBadge";
import { CarrierDocumentsBlock } from "@/components/carrier/CarrierDocumentsBlock";
import { CarrierDriverFormDialog } from "@/components/carrier/CarrierForms";

export const Route = createFileRoute("/carrier/drivers")({
  head: () => ({ meta: [{ title: "Мои водители — кабинет перевозчика" }] }),
  component: CarrierDriversPage,
});

type Driver = {
  id: string;
  full_name: string | null;
  phone: string | null;
  city: string | null;
  license_number: string | null;
  license_categories: string | null;
  dispatcher_status: string | null;
  docs_verified: boolean | null;
  is_active: boolean | null;
  source: "production" | "dispatcher";
};

function statusLabel(s: string | null): string {
  if (!s) return "—";
  return DRIVER_STATUS_LABELS[s as DriverStatus] ?? s;
}

function CarrierDriversPage() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["carrier", "drivers"],
    queryFn: () => apiGetAuth<{ rows: Driver[] }>("/api/carrier/drivers", 10000),
  });
  const drivers = data?.rows ?? [];
  const archiveMut = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/carrier/drivers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["carrier", "drivers"] });
      toast.success("Водитель архивирован");
    },
    onError: (e: Error) => toast.error(e.message || "Не удалось архивировать"),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-medium">Мои водители</h2>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Добавить водителя
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Водители вашей компании. Можно добавить, редактировать и привязать к машине.
      </p>
      <CarrierDriverFormDialog open={addOpen} onOpenChange={setAddOpen} />


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
                  {d.dispatcher_status ? (
                    <StatusBadge
                      status={d.dispatcher_status}
                      label={statusLabel(d.dispatcher_status)}
                    />
                  ) : (
                    <Badge variant={d.is_active ? "outline" : "secondary"}>
                      {d.is_active ? "Активен" : "Не активен"}
                    </Badge>
                  )}
                </div>
                <div className="text-muted-foreground">{d.phone ?? "—"}</div>
                {d.city && <div className="text-xs">Город: {d.city}</div>}
                {d.license_number && (
                  <div className="text-xs">
                    ВУ: <span className="font-medium">{d.license_number}</span>
                    {d.license_categories ? ` (${d.license_categories})` : ""}
                  </div>
                )}
                {d.source === "dispatcher" && (
                  <>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Badge variant={d.docs_verified ? "outline" : "secondary"}>
                        {d.docs_verified ? "Документы проверены" : "Документы не проверены"}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => archiveMut.mutate(d.id)}
                        disabled={archiveMut.isPending}
                      >
                        <Archive className="mr-1 h-3 w-3" /> В архив
                      </Button>
                    </div>
                    <div className="pt-2">
                      <CarrierDocumentsBlock ownerType="driver" ownerId={d.id} />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
