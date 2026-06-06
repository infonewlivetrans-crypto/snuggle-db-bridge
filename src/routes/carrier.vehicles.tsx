import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, Loader2, Plus, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiDelete, apiGetAuth } from "@/lib/api-client";
import {
  CarrierVehicleForm,
  type CarrierVehicle,
} from "@/components/carrier/CarrierVehicleForm";
import {
  VEHICLE_STATUS_LABELS,
  statusBadgeClass,
  LOAD_METHOD_LABELS,
  type LoadMethod,
} from "@/lib/dispatcher/statuses";

export const Route = createFileRoute("/carrier/vehicles")({
  head: () => ({ meta: [{ title: "Мой транспорт — кабинет перевозчика" }] }),
  component: CarrierVehiclesPage,
});

type ListResp = { rows: CarrierVehicle[]; total: number };
type DriverRow = { id: string; full_name: string | null };

function CarrierVehiclesPage() {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CarrierVehicle | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<CarrierVehicle | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["carrier", "vehicles"],
    queryFn: () => apiGetAuth<ListResp>("/api/carrier/vehicles", 10000),
  });
  const { data: driversData } = useQuery({
    queryKey: ["carrier", "drivers"],
    queryFn: () => apiGetAuth<{ rows: DriverRow[] }>("/api/carrier/drivers", 10000),
  });

  const vehicles = data?.rows ?? [];
  const drivers = driversData?.rows ?? [];
  const driverNameById: Record<string, string> = Object.fromEntries(
    drivers.map((d) => [d.id, d.full_name ?? "—"]),
  );

  const refetch = () => {
    void qc.invalidateQueries({ queryKey: ["carrier", "vehicles"] });
  };

  const onArchive = async () => {
    if (!confirmArchive) return;
    try {
      await apiDelete(`/api/carrier/vehicles/${confirmArchive.id}`, 10000);
      toast.success("Транспорт перенесён в архив");
      setConfirmArchive(null);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Мой транспорт</h2>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
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
              <CardContent className="space-y-1.5 p-4 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-base font-semibold">{v.vehicle_kind ?? "—"}</div>
                  <Badge variant="outline" className={statusBadgeClass(v.dispatcher_status)}>
                    {VEHICLE_STATUS_LABELS[v.dispatcher_status as keyof typeof VEHICLE_STATUS_LABELS] ??
                      v.dispatcher_status}
                  </Badge>
                </div>
                <div className="text-muted-foreground">
                  {v.body_type ?? "—"}
                  {v.payload_kg != null ? ` · ${v.payload_kg} кг` : ""}
                  {v.volume_m3 != null ? ` · ${v.volume_m3} м³` : ""}
                </div>
                {(v.length_m || v.width_m || v.height_m) && (
                  <div className="text-xs text-muted-foreground">
                    Габариты: {v.length_m ?? "?"}×{v.width_m ?? "?"}×{v.height_m ?? "?"} м
                  </div>
                )}
                {v.load_methods && v.load_methods.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    Загрузка:{" "}
                    {v.load_methods
                      .map((m) => LOAD_METHOD_LABELS[m as LoadMethod] ?? m)
                      .join(", ")}
                  </div>
                )}
                <div className="text-xs">
                  Город: <span className="font-medium">{v.home_city ?? "—"}</span>
                  {v.ready_date ? ` · готов с ${v.ready_date}` : ""}
                </div>
                {v.dispatcher_driver_ext_id && (
                  <div className="text-xs">
                    Водитель:{" "}
                    <span className="font-medium">
                      {driverNameById[v.dispatcher_driver_ext_id] ?? "назначен"}
                    </span>
                  </div>
                )}
                {v.dispatcher_comment && (
                  <div className="text-xs text-muted-foreground">{v.dispatcher_comment}</div>
                )}
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditing(v);
                      setFormOpen(true);
                    }}
                  >
                    <Edit className="mr-1 h-3.5 w-3.5" /> Редактировать
                  </Button>
                  {v.dispatcher_status !== "archive" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmArchive(v)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> В архив
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CarrierVehicleForm
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
        drivers={drivers}
        onSaved={refetch}
      />

      <AlertDialog
        open={!!confirmArchive}
        onOpenChange={(o) => !o && setConfirmArchive(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Перенести транспорт в архив?</AlertDialogTitle>
            <AlertDialogDescription>
              Транспорт перестанет участвовать в подборе грузов. Запись не удаляется и
              остаётся в истории.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={onArchive}>В архив</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
