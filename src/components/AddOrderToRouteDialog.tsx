import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db";
import { toast } from "sonner";
import type { Order } from "@/lib/orders";
import {
  type DeliveryRoute,
  ROUTE_STATUS_LABELS,
  ROUTE_STATUS_STYLES,
} from "@/lib/routes";
import { Plus, Route as RouteIcon } from "lucide-react";

interface Props {
  order: Order;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddOrderToRouteDialog({ order, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [routeId, setRouteId] = useState<string>("");

  // Маршруты, в которые ещё имеет смысл добавлять (planned / in_progress), от свежих к старым
  const { data: routes } = useQuery({
    queryKey: ["routes", "addable"],
    enabled: open,
    queryFn: async (): Promise<DeliveryRoute[]> => {
      const { data, error } = await supabase
        .from("routes")
        .select("*")
        .in("status", ["planned", "in_progress"])
        .order("route_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as DeliveryRoute[];
    },
  });

  // Проверяем, в каких маршрутах заказ уже есть, чтобы их подсветить
  const { data: existingPoints } = useQuery({
    queryKey: ["route-points", "for-order", order.id],
    enabled: open,
    queryFn: async (): Promise<{ route_id: string }[]> => {
      const { data, error } = await supabase
        .from("route_points")
        .select("route_id")
        .eq("order_id", order.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const usedRouteIds = new Set((existingPoints ?? []).map((p) => p.route_id));

  const mutation = useMutation({
    mutationFn: async () => {
      if (!routeId) throw new Error("Выберите маршрут");
      if (usedRouteIds.has(routeId)) throw new Error("Заказ уже есть в этом маршруте");

      // Берём максимальный point_number в маршруте
      const { data: maxRow, error: maxErr } = await supabase
        .from("route_points")
        .select("point_number")
        .eq("route_id", routeId)
        .order("point_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (maxErr) throw maxErr;
      const next = (maxRow?.point_number ?? 0) + 1;

      const { error } = await db.from("route_points").insert({
        route_id: routeId,
        order_id: order.id,
        point_number: next,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routes"] });
      qc.invalidateQueries({ queryKey: ["route-points"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["delivery_reports"] });
      toast.success("Заказ добавлен в маршрут");
      onOpenChange(false);
      setRouteId("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selected = routes?.find((r) => r.id === routeId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Добавить в маршрут</DialogTitle>
          <DialogDescription>
            Заказ <span className="font-mono font-semibold">{order.order_number}</span> будет добавлен последней точкой
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div>
            <Label>Маршрут</Label>
            <Select value={routeId} onValueChange={setRouteId}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder={(routes?.length ?? 0) === 0 ? "Нет активных маршрутов" : "Выберите маршрут"} />
              </SelectTrigger>
              <SelectContent>
                {(routes ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id} disabled={usedRouteIds.has(r.id)}>
                    {r.route_number} · {new Date(r.route_date).toLocaleDateString("ru-RU")}
                    {r.driver_name ? ` · ${r.driver_name}` : ""}
                    {usedRouteIds.has(r.id) ? " (уже добавлен)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selected && (
            <div className="rounded-lg border border-border bg-secondary/40 p-3 text-sm">
              <div className="flex items-center gap-2">
                <RouteIcon className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono font-semibold">{selected.route_number}</span>
                <Badge variant="outline" className={ROUTE_STATUS_STYLES[selected.status]}>
                  {ROUTE_STATUS_LABELS[selected.status]}
                </Badge>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Дата: {new Date(selected.route_date).toLocaleDateString("ru-RU")}
                {selected.driver_name ? ` · Водитель: ${selected.driver_name}` : ""}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !routeId} className="gap-1.5">
              <Plus className="h-4 w-4" />
              {mutation.isPending ? "Добавление…" : "Добавить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
