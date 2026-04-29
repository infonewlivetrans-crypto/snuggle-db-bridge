import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Route as RouteIcon, Plus, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import {
  DELIVERY_ROUTE_STATUS_LABELS,
  DELIVERY_ROUTE_STATUS_STYLES,
  type DeliveryRouteStatus,
} from "@/lib/deliveryRoutes";

type Existing = {
  id: string;
  route_number: string;
  status: DeliveryRouteStatus;
  route_date: string;
};

export function CreateRouteFromRequestBlock({
  requestId,
  warehouseId,
  routeDate,
  ordersCount,
  blockedByShortage = false,
}: {
  requestId: string;
  warehouseId: string | null;
  routeDate: string;
  ordersCount: number;
  blockedByShortage?: boolean;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: existing } = useQuery({
    queryKey: ["delivery-routes-by-request", requestId],
    queryFn: async (): Promise<Existing[]> => {
      const { data, error } = await supabase
        .from("delivery_routes")
        .select("id, route_number, status, route_date")
        .eq("source_request_id", requestId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Existing[];
    },
  });

  const createRoute = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("delivery_routes")
        .insert({
          route_number: "",
          source_request_id: requestId,
          source_warehouse_id: warehouseId,
          route_date: routeDate,
          status: "formed",
        })
        .select("id, route_number")
        .single();
      if (error) throw error;

      // Заявка → "В работе"
      const { error: upErr } = await supabase
        .from("routes")
        .update({
          request_status: "in_progress",
          request_status_changed_by: "Логист",
          request_status_changed_at: new Date().toISOString(),
          request_status_comment: `Создан маршрут ${data.route_number}`,
        })
        .eq("id", requestId);
      if (upErr) throw upErr;

      await supabase.from("transport_request_status_history").insert({
        route_id: requestId,
        to_status: "in_progress",
        changed_by: "Логист",
        comment: `Создан маршрут ${data.route_number}`,
      });

      return data;
    },
    onSuccess: (data) => {
      toast.success(`Маршрут ${data.route_number} создан`);
      qc.invalidateQueries({ queryKey: ["delivery-routes-by-request", requestId] });
      qc.invalidateQueries({ queryKey: ["transport-request", requestId] });
      qc.invalidateQueries({ queryKey: ["delivery-routes"] });
      navigate({
        to: "/delivery-routes/$deliveryRouteId",
        params: { deliveryRouteId: data.id },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disabled = ordersCount === 0;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <RouteIcon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Маршрут на основе заявки</h3>
      </div>

      {existing && existing.length > 0 ? (
        <div className="space-y-2">
          {existing.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() =>
                navigate({
                  to: "/delivery-routes/$deliveryRouteId",
                  params: { deliveryRouteId: r.id },
                })
              }
              className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-left transition-colors hover:bg-secondary"
            >
              <div className="flex items-center gap-2">
                <RouteIcon className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{r.route_number}</span>
                <Badge variant="outline" className={DELIVERY_ROUTE_STATUS_STYLES[r.status]}>
                  {DELIVERY_ROUTE_STATUS_LABELS[r.status]}
                </Badge>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => createRoute.mutate()}
            disabled={disabled || createRoute.isPending}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Ещё один маршрут
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Сформируйте маршрут доставки по точкам этой заявки.
          </p>
          <Button
            onClick={() => createRoute.mutate()}
            disabled={disabled || createRoute.isPending}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            {createRoute.isPending ? "Создание..." : "Создать маршрут"}
          </Button>
          {disabled && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Добавьте заказы в заявку, чтобы создать маршрут.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
