import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { apiPost, fetchListViaApi } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Driver } from "@/lib/carriers";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
};

export function CreateManualDeliveryRouteDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const today = new Date().toISOString().slice(0, 10);
  const [routeNumber, setRouteNumber] = useState("");
  const [routeDate, setRouteDate] = useState(today);
  const [driverId, setDriverId] = useState<string>("");
  const [vehicle, setVehicle] = useState("");
  const [manager, setManager] = useState("");
  const [comment, setComment] = useState("");

  const { data: drivers } = useQuery({
    enabled: open,
    queryKey: ["drivers", "active"],
    queryFn: async (): Promise<Driver[]> => {
      const { rows } = await fetchListViaApi<Driver>("/api/drivers", {
        limit: 500,
        extra: { activeOnly: "1" },
      });
      return rows;
    },
    staleTime: 60_000,
  });

  const selectedDriver = (drivers ?? []).find((d) => d.id === driverId) ?? null;

  const reset = () => {
    setRouteNumber("");
    setRouteDate(today);
    setDriverId("");
    setVehicle("");
    setManager("");
    setComment("");
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!selectedDriver) throw new Error("Выберите водителя из справочника");

      const number = routeNumber.trim();
      const combinedComment =
        [
          manager.trim() ? `Менеджер: ${manager.trim()}` : "",
          comment.trim(),
        ]
          .filter(Boolean)
          .join("\n") || null;

      const srcRoute = await apiPost<{ id: string; route_number: string }>("/api/routes", {
        route_number: number || undefined,
        generate_number: !number,
        route_date: routeDate,
        driver_name: selectedDriver.full_name,
        comment: combinedComment,
        status: "planned",
      });

      const dr = await apiPost<{ id: string }>("/api/delivery-routes", {
        route_number: srcRoute.route_number,
        route_date: routeDate,
        assigned_driver: selectedDriver.full_name,
        assigned_vehicle: vehicle.trim() || null,
        driver_id: selectedDriver.id,
        carrier_id: selectedDriver.carrier_id,
        source_request_id: srcRoute.id,
        status: "formed",
        comment: combinedComment,
      });

      return dr.id;
    },
    onSuccess: (id) => {
      toast.success("Маршрут создан");
      qc.invalidateQueries({ queryKey: ["delivery-routes"] });
      reset();
      onOpenChange(false);
      navigate({ to: "/delivery-routes/$deliveryRouteId", params: { deliveryRouteId: id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Создать маршрут вручную</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="rn">Номер маршрута</Label>
            <Input
              id="rn"
              value={routeNumber}
              onChange={(e) => setRouteNumber(e.target.value)}
              placeholder="Оставьте пустым для авто-генерации"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rd">Дата маршрута</Label>
            <Input
              id="rd"
              type="date"
              value={routeDate}
              onChange={(e) => setRouteDate(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="dr">Водитель *</Label>
            <Select value={driverId} onValueChange={setDriverId}>
              <SelectTrigger id="dr">
                <SelectValue placeholder="Выберите водителя из справочника" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {(drivers ?? []).length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    Активных водителей нет
                  </div>
                ) : (
                  (drivers ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.full_name}
                      {d.phone ? ` · ${d.phone}` : ""}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Свободный ввод недоступен. Назначение идёт из справочника водителей.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="vh">Машина</Label>
            <Input
              id="vh"
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value)}
              placeholder="Гос. номер / марка"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="mg">Менеджер</Label>
            <Input
              id="mg"
              value={manager}
              onChange={(e) => setManager(e.target.value)}
              placeholder="ФИО менеджера маршрута"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cm">Комментарий</Label>
            <Textarea
              id="cm"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !routeDate || !driverId}>
            {create.isPending ? "Создание…" : "Создать маршрут"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
