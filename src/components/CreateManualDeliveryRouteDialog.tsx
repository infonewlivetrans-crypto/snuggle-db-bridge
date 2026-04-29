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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

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
  const [driver, setDriver] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [manager, setManager] = useState("");
  const [comment, setComment] = useState("");

  const reset = () => {
    setRouteNumber("");
    setRouteDate(today);
    setDriver("");
    setVehicle("");
    setManager("");
    setComment("");
  };

  const create = useMutation({
    mutationFn: async () => {
      // Авто-номер при необходимости
      let number = routeNumber.trim();
      if (!number) {
        const { data: numData, error: numErr } = await supabase.rpc(
          "generate_route_number",
        );
        if (numErr) throw numErr;
        number = numData as string;
      }

      // 1) Создаём базовую запись в routes (нужна для связи с route_points)
      const { data: srcRoute, error: srcErr } = await supabase
        .from("routes")
        .insert({
          route_number: number,
          route_date: routeDate,
          driver_name: driver.trim() || null,
          comment:
            (manager.trim() ? `Менеджер: ${manager.trim()}` : "") +
            (comment.trim() ? (manager.trim() ? "\n" : "") + comment.trim() : "") ||
            null,
          status: "planned",
        })
        .select("id")
        .single();
      if (srcErr) throw srcErr;

      // 2) Создаём delivery_routes со ссылкой на routes
      const { data: dr, error: drErr } = await supabase
        .from("delivery_routes")
        .insert({
          route_number: number,
          route_date: routeDate,
          assigned_driver: driver.trim() || null,
          assigned_vehicle: vehicle.trim() || null,
          source_request_id: srcRoute.id,
          status: "formed",
          comment:
            [
              manager.trim() ? `Менеджер: ${manager.trim()}` : "",
              comment.trim(),
            ]
              .filter(Boolean)
              .join("\n") || null,
        })
        .select("id")
        .single();
      if (drErr) throw drErr;

      return dr.id as string;
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
            <Label htmlFor="dr">Водитель</Label>
            <Input
              id="dr"
              value={driver}
              onChange={(e) => setDriver(e.target.value)}
              placeholder="ФИО водителя"
            />
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
          <Button onClick={() => create.mutate()} disabled={create.isPending || !routeDate}>
            {create.isPending ? "Создание…" : "Создать маршрут"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
