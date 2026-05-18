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
import { apiGetAuth, apiPost } from "@/lib/api-client";
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

  // Маршруты, в которые ещё имеет смысл добавлять (planned / in_progress)
  const { data: routes } = useQuery({
    queryKey: ["routes", "addable"],
    enabled: open,
    queryFn: async (): Promise<DeliveryRoute[]> => {
      // /api/routes принимает один status; берём активные и planned по очереди
      const [planned, active] = await Promise.all([
        apiGetAuth<DeliveryRoute[]>(
          "/api/routes?status=planned&limit=50",
        ).catch(() => [] as DeliveryRoute[]),
        apiGetAuth<DeliveryRoute[]>(
          "/api/routes?status=in_progress&limit=50",
        ).catch(() => [] as DeliveryRoute[]),
      ]);
      const merged = [...(planned ?? []), ...(active ?? [])];
      // сортируем по route_date desc, затем по created_at desc
      merged.sort((a, b) => {
        const ad = a.route_date ?? "";
        const bd = b.route_date ?? "";
        if (ad !== bd) return ad < bd ? 1 : -1;
        const ac = (a as { created_at?: string }).created_at ?? "";
        const bc = (b as { created_at?: string }).created_at ?? "";
        return ac < bc ? 1 : -1;
      });
      return merged.slice(0, 50);
    },
  });

  // Проверяем, в каких маршрутах заказ уже есть
  const { data: existingPoints } = useQuery({
    queryKey: ["route-points", "for-order", order.id],
    enabled: open,
    queryFn: async (): Promise<{ route_id: string }[]> => {
      const data = await apiGetAuth<{ route_id: string }[]>(
        `/api/route-points?order_id_in=${encodeURIComponent(order.id)}&fields=${encodeURIComponent("route_id")}`,
      );
      return data ?? [];
    },
  });

  const usedRouteIds = new Set((existingPoints ?? []).map((p) => p.route_id));

  const mutation = useMutation({
    mutationFn: async () => {
      if (!routeId) throw new Error("Выберите маршрут");
      if (usedRouteIds.has(routeId)) throw new Error("Заказ уже есть в этом маршруте");
      await apiPost("/api/route-points/append", {
        route_id: routeId,
        order_ids: [order.id],
      });
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
