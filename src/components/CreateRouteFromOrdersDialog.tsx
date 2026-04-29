import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  const [driver, setDriver] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [comment, setComment] = useState("");

  const ordersWithoutCoords = orders.filter(
    (o) => o.latitude == null || o.longitude == null,
  );

  const reset = () => {
    setRouteNumber("");
    setRouteDate(today);
    setDriver("");
    setVehicle("");
    setComment("");
  };

  const create = useMutation({
    mutationFn: async () => {
      if (orders.length === 0) throw new Error("Не выбран ни один заказ");

      // 1) Номер маршрута
      let number = routeNumber.trim();
      if (!number) {
        const { data: numData, error: numErr } = await supabase.rpc("generate_route_number");
        if (numErr) throw numErr;
        number = numData as string;
      }

      // 2) Создаём базовую запись routes
      const { data: srcRoute, error: srcErr } = await supabase
        .from("routes")
        .insert({
          route_number: number,
          route_date: routeDate,
          driver_name: driver.trim() || null,
          comment: comment.trim() || null,
          status: "planned",
          points_count: orders.length,
        })
        .select("id")
        .single();
      if (srcErr) throw srcErr;

      // 3) Создаём delivery_routes (он же видим как «Маршруты»)
      const { data: dr, error: drErr } = await supabase
        .from("delivery_routes")
        .insert({
          route_number: number,
          route_date: routeDate,
          assigned_driver: driver.trim() || null,
          assigned_vehicle: vehicle.trim() || null,
          source_request_id: srcRoute.id,
          status: "formed",
          comment: comment.trim() || null,
        })
        .select("id")
        .single();
      if (drErr) throw drErr;

      // 4) Точки маршрута для каждого заказа
      const points = orders.map((o, idx) => ({
        route_id: srcRoute.id,
        order_id: o.id,
        point_number: idx + 1,
        status: "pending" as const,
      }));
      const { error: pointsErr } = await supabase.from("route_points").insert(points);
      if (pointsErr) throw pointsErr;

      return dr.id as string;
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
            <Label htmlFor="dr">Водитель</Label>
            <Input
              id="dr"
              value={driver}
              onChange={(e) => setDriver(e.target.value)}
              placeholder="ФИО водителя"
            />
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
