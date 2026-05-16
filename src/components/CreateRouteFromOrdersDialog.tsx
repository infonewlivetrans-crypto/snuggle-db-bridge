import { useState, useMemo } from "react";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { AlertTriangle, MapPin } from "lucide-react";
import type { Order } from "@/lib/orders";
import type { Driver } from "@/lib/carriers";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orders: Order[];
};

export function CreateRouteFromOrdersDialog({ open, onOpenChange, orders }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const today = new Date().toISOString().slice(0, 10);
  const [routeNumber, setRouteNumber] = useState("");
  const [routeDate, setRouteDate] = useState(today);
  const [driverId, setDriverId] = useState<string>("");
  const [vehicle, setVehicle] = useState("");
  const [comment, setComment] = useState("");

  const ordersWithoutCoords = orders.filter(
    (o) => o.latitude == null || o.longitude == null,
  );

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

  const selectedDriver = useMemo(
    () => (drivers ?? []).find((d) => d.id === driverId) ?? null,
    [drivers, driverId],
  );

  const reset = () => {
    setRouteNumber("");
    setRouteDate(today);
    setDriverId("");
    setVehicle("");
    setComment("");
  };

  const create = useMutation({
    mutationFn: async () => {
      if (orders.length === 0) throw new Error("Не выбран ни один заказ");
      if (!selectedDriver) throw new Error("Выберите водителя из справочника");

      const number = routeNumber.trim();
      const srcRoute = await apiPost<{ id: string; route_number: string }>("/api/routes", {
        route_number: number || undefined,
        generate_number: !number,
        route_date: routeDate,
        driver_name: selectedDriver.full_name,
        comment: comment.trim() || null,
        status: "planned",
        points_count: orders.length,
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
        comment: comment.trim() || null,
      });

      await apiPost("/api/route-points", {
        points: orders.map((o, idx) => ({
          route_id: srcRoute.id,
          order_id: o.id,
          point_number: idx + 1,
          status: "pending" as const,
        })),
      });

      return dr.id;
    },
    onSuccess: (id) => {
      toast.success(`Маршрут создан: ${orders.length} ${pluralPoints(orders.length)}`);
      qc.invalidateQueries({ queryKey: ["delivery-routes"] });
      qc.invalidateQueries({ queryKey: ["routes"] });
      qc.invalidateQueries({ queryKey: ["route-points"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
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
          <DialogTitle>Создать маршрут из выбранных заказов</DialogTitle>
          <DialogDescription>
            Будет создан новый маршрут с {orders.length} {pluralPoints(orders.length)}.
            Все данные клиента (адрес, телефон, сумма к получению, QR, тип оплаты) подтянутся
            из заказа автоматически.
          </DialogDescription>
        </DialogHeader>

        {ordersWithoutCoords.length > 0 && (
          <div className="rt-alert rt-alert-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <div className="font-medium">
                Нет координат у {ordersWithoutCoords.length} {pluralOrders(ordersWithoutCoords.length)}
              </div>
              <div className="mt-0.5 text-xs">
                Маршрут может быть неточным.{" "}
                {ordersWithoutCoords
                  .slice(0, 5)
                  .map((o) => o.order_number)
                  .join(", ")}
                {ordersWithoutCoords.length > 5 ? "…" : ""}
              </div>
            </div>
          </div>
        )}

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
          <div className="grid grid-cols-2 gap-3">
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
              <Label htmlFor="vh">Машина</Label>
              <Input
                id="vh"
                value={vehicle}
                onChange={(e) => setVehicle(e.target.value)}
                placeholder="Гос. номер"
              />
            </div>
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
              Свободный ввод недоступен — назначение идёт только из справочника водителей.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cm">Комментарий</Label>
            <Textarea
              id="cm"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
            />
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Заказы в маршруте ({orders.length})
            </div>
            <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
              {orders.map((o, i) => {
                const noCoords = o.latitude == null || o.longitude == null;
                return (
                  <li key={o.id} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{i + 1}.</span>
                    <span className="font-mono text-xs font-semibold">{o.order_number}</span>
                    <span className="truncate text-xs text-foreground">
                      {o.delivery_address ?? "—"}
                    </span>
                    {noCoords && (
                      <span className="ml-auto inline-flex items-center gap-1 text-xs text-status-warning">
                        <MapPin className="h-3 w-3" />
                        нет координат
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || !routeDate || orders.length === 0}
          >
            {create.isPending ? "Создание…" : "Создать маршрут"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function pluralPoints(n: number) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "точкой";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "точками";
  return "точками";
}
function pluralOrders(n: number) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "заказа";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "заказов";
  return "заказов";
}
