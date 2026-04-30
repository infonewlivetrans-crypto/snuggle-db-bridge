import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Copy, Phone, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { computeRouteEta } from "@/lib/eta";
import { buildClientEtaMessage, copyToClipboard } from "@/lib/clientMessage";

/**
 * Блок «Сообщение клиенту»: автогенерация текста о времени прибытия,
 * кнопка «Скопировать сообщение» и «Позвонить клиенту». Без внешних интеграций.
 */
export function OrderClientMessageBlock({
  orderId,
  orderNumber,
  clientPhone,
}: {
  orderId: string;
  orderNumber: string;
  clientPhone: string | null;
}) {
  const { data: routePoint } = useQuery({
    queryKey: ["order-active-route-point", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("route_points")
        .select(
          "id, point_number, route_id, dp_status, client_window_from, client_window_to, dp_planned_arrival_at",
        )
        .eq("order_id", orderId)
        .not("dp_status", "in", "(delivered,not_delivered,returned_to_warehouse)")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        point_number: number;
        route_id: string;
      } | null;
    },
  });

  const sourceRouteId = routePoint?.route_id ?? null;

  const { data: route } = useQuery({
    enabled: !!sourceRouteId,
    queryKey: ["order-msg-route", sourceRouteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routes")
        .select("id, avg_speed_kmh, default_service_minutes, planned_departure_at")
        .eq("id", sourceRouteId!)
        .maybeSingle();
      if (error) throw error;
      return data as {
        avg_speed_kmh: number | null;
        default_service_minutes: number | null;
        planned_departure_at: string | null;
      } | null;
    },
  });

  const { data: deliveryRoute } = useQuery({
    enabled: !!sourceRouteId,
    queryKey: ["order-msg-delivery-route", sourceRouteId],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_routes")
        .select(
          "id, assigned_driver, last_driver_lat, last_driver_lng, last_driver_location_at",
        )
        .eq("source_request_id", sourceRouteId!)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        assigned_driver: string | null;
        last_driver_lat: number | null;
        last_driver_lng: number | null;
        last_driver_location_at: string | null;
      } | null;
    },
  });

  const { data: allPoints } = useQuery({
    enabled: !!sourceRouteId,
    queryKey: ["order-msg-points", sourceRouteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("route_points")
        .select(
          "point_number, dp_status, client_window_from, client_window_to, dp_planned_arrival_at, order:order_id(latitude, longitude)",
        )
        .eq("route_id", sourceRouteId!)
        .order("point_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{
        point_number: number;
        dp_status: string;
        client_window_from: string | null;
        client_window_to: string | null;
        dp_planned_arrival_at: string | null;
        order: { latitude: number | null; longitude: number | null } | null;
      }>;
    },
  });

  const { etaAtIso, isLateRisk } = useMemo(() => {
    if (!routePoint || !allPoints || allPoints.length === 0) {
      return { etaAtIso: null as string | null, isLateRisk: false };
    }
    const eta = computeRouteEta({
      driver:
        deliveryRoute?.last_driver_lat != null && deliveryRoute?.last_driver_lng != null
          ? {
              lat: deliveryRoute.last_driver_lat,
              lng: deliveryRoute.last_driver_lng,
              at: deliveryRoute.last_driver_location_at ?? null,
            }
          : null,
      points: allPoints.map((p) => ({
        point_number: p.point_number,
        status: p.dp_status,
        latitude: p.order?.latitude ?? null,
        longitude: p.order?.longitude ?? null,
        client_window_from: p.client_window_from,
        client_window_to: p.client_window_to,
        planned_arrival_at: p.dp_planned_arrival_at,
      })),
      avgSpeedKmh: route?.avg_speed_kmh ?? 35,
      serviceMinutes: route?.default_service_minutes ?? 20,
      plannedDepartureAt: route?.planned_departure_at ?? null,
    });
    const mine = eta.find((e) => e.point_number === routePoint.point_number);
    return {
      etaAtIso: mine?.eta_at ?? null,
      isLateRisk: mine?.risk === "late" || mine?.risk === "tight",
    };
  }, [routePoint, allPoints, deliveryRoute, route]);

  const message = buildClientEtaMessage({
    orderNumber,
    etaAtIso,
    isLateRisk,
    driverName: deliveryRoute?.assigned_driver ?? null,
    driverPhone: null,
  });

  const handleCopy = async () => {
    const ok = await copyToClipboard(message);
    if (ok) toast.success("Сообщение скопировано");
    else toast.error("Не удалось скопировать");
  };

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <MessageSquare className="h-3.5 w-3.5" />
        Сообщение клиенту
      </div>
      <textarea
        readOnly
        value={message}
        className="mb-3 min-h-[88px] w-full resize-y rounded-md border border-border bg-secondary/40 p-2 text-sm text-foreground"
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={handleCopy} className="gap-1.5">
          <Copy className="h-3.5 w-3.5" />
          Скопировать сообщение
        </Button>
        <Button
          size="sm"
          variant="outline"
          asChild={!!clientPhone}
          disabled={!clientPhone}
          className="gap-1.5"
        >
          {clientPhone ? (
            <a href={`tel:${clientPhone}`}>
              <Phone className="h-3.5 w-3.5" />
              Позвонить клиенту
            </a>
          ) : (
            <span>
              <Phone className="h-3.5 w-3.5" />
              Позвонить клиенту
            </span>
          )}
        </Button>
      </div>
      {!etaAtIso && (
        <div className="mt-2 text-xs text-muted-foreground">
          ETA пока не рассчитан — текст сформирован с заглушками времени.
        </div>
      )}
    </div>
  );
}
