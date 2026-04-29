import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Clock, Timer } from "lucide-react";
import {
  computeRouteEta,
  ETA_RISK_LABELS,
  ETA_RISK_STYLES,
  formatTime,
} from "@/lib/eta";

/**
 * Ожидаемое время прибытия для конкретного заказа.
 * Ищем активную точку маршрута, грузим параметры маршрута и позицию водителя,
 * считаем ETA. Не нагружаем БД — расчёт на клиенте.
 */
export function OrderEtaBlock({ orderId }: { orderId: string }) {
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
        dp_status: string;
        client_window_from: string | null;
        client_window_to: string | null;
        dp_planned_arrival_at: string | null;
      } | null;
    },
  });

  const sourceRouteId = routePoint?.route_id ?? null;

  const { data: route } = useQuery({
    enabled: !!sourceRouteId,
    queryKey: ["order-eta-route", sourceRouteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routes")
        .select("id, avg_speed_kmh, default_service_minutes, planned_departure_at")
        .eq("id", sourceRouteId!)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        avg_speed_kmh: number | null;
        default_service_minutes: number | null;
        planned_departure_at: string | null;
      } | null;
    },
  });

  const { data: deliveryRoute } = useQuery({
    enabled: !!sourceRouteId,
    queryKey: ["order-eta-delivery-route", sourceRouteId],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_routes")
        .select("id, last_driver_lat, last_driver_lng, last_driver_location_at")
        .eq("source_request_id", sourceRouteId!)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        last_driver_lat: number | null;
        last_driver_lng: number | null;
        last_driver_location_at: string | null;
      } | null;
    },
  });

  const { data: allPoints } = useQuery({
    enabled: !!sourceRouteId,
    queryKey: ["order-eta-points", sourceRouteId],
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

  if (!routePoint || !allPoints || allPoints.length === 0) return null;

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
  if (!mine) return null;

  const etaDate = new Date(mine.eta_at!);
  const fromDate = new Date(etaDate.getTime() - 15 * 60_000);
  const toDate = new Date(etaDate.getTime() + 15 * 60_000);

  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${ETA_RISK_STYLES[mine.risk]}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Timer className="h-4 w-4" />
        <span className="font-semibold">Ожидаемое время прибытия:</span>
        <span>
          с <span className="font-mono">{formatTime(fromDate.toISOString())}</span> до{" "}
          <span className="font-mono">{formatTime(toDate.toISOString())}</span>
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-xs">
          <Clock className="h-3 w-3" />
          {ETA_RISK_LABELS[mine.risk]}
          {mine.risk === "late" ? ` · ~${mine.delay_minutes} мин` : ""}
        </span>
      </div>
      {mine.window_to_iso && (
        <div className="mt-1 text-xs opacity-80">
          Окно клиента: до {formatTime(mine.window_to_iso)}
          {mine.risk === "late" && " — риск опоздания к клиенту"}
        </div>
      )}
    </div>
  );
}
