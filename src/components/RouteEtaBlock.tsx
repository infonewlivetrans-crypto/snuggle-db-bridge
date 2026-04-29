import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Clock, Timer, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  computeRouteEta,
  ETA_RISK_LABELS,
  ETA_RISK_STYLES,
  formatTime,
  type EtaInputPoint,
  type EtaRiskLevel,
} from "@/lib/eta";

const LATE_NOTIFY_MINUTES = 20; // опаздывает >20 мин — уведомление
const NOTIFY_COOLDOWN_MS = 30 * 60 * 1000;

type EtaPointInput = EtaInputPoint & {
  order_id: string;
  order_number: string;
  contact_name: string | null;
};

export function RouteEtaBlock({
  deliveryRouteId,
  routeNumber,
  sourceRouteId,
  points,
  driverLat,
  driverLng,
  lastUpdateAt,
}: {
  deliveryRouteId: string;
  routeNumber: string;
  sourceRouteId: string | null;
  points: EtaPointInput[];
  driverLat: number | null | undefined;
  driverLng: number | null | undefined;
  lastUpdateAt: string | null | undefined;
}) {
  const { data: routeSettings } = useQuery({
    enabled: !!sourceRouteId,
    queryKey: ["route-eta-settings", sourceRouteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routes")
        .select("avg_speed_kmh, default_service_minutes, planned_departure_at")
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

  const eta = useMemo(() => {
    return computeRouteEta({
      driver:
        driverLat != null && driverLng != null
          ? { lat: driverLat, lng: driverLng, at: lastUpdateAt ?? null }
          : null,
      points,
      avgSpeedKmh: routeSettings?.avg_speed_kmh ?? 35,
      serviceMinutes: routeSettings?.default_service_minutes ?? 20,
      plannedDepartureAt: routeSettings?.planned_departure_at ?? null,
    });
  }, [driverLat, driverLng, lastUpdateAt, points, routeSettings]);

  const lateRisks = eta.filter((e) => e.risk === "late");
  const tightRisks = eta.filter((e) => e.risk === "tight");
  const overall: EtaRiskLevel = lateRisks.length > 0 ? "late" : tightRisks.length > 0 ? "tight" : "on_time";

  // Уведомление при сильном опоздании (>20 мин) — менеджеру и логисту
  const lastNotifiedRef = useRef<Record<string, number>>({});
  useEffect(() => {
    const now = Date.now();
    for (const e of eta) {
      if (e.risk !== "late" || e.delay_minutes < LATE_NOTIFY_MINUTES) continue;
      const meta = points.find((p) => p.point_number === e.point_number);
      if (!meta) continue;
      const key = `${deliveryRouteId}:${meta.order_id}`;
      if (now - (lastNotifiedRef.current[key] ?? 0) < NOTIFY_COOLDOWN_MS) continue;
      lastNotifiedRef.current[key] = now;

      void supabase.from("notifications").insert({
        kind: "order_eta_late_risk",
        title: "Риск опоздания к клиенту",
        body: `По заказу №${meta.order_number} есть риск опоздания (≈ ${e.delay_minutes} мин).`,
        payload: {
          delivery_route_id: deliveryRouteId,
          route_number: routeNumber,
          order_id: meta.order_id,
          order_number: meta.order_number,
          point_number: meta.point_number,
          eta_at: e.eta_at,
          window_to_iso: e.window_to_iso,
          delay_minutes: e.delay_minutes,
          recipients: ["manager", "logistician"],
          occurred_at: new Date().toISOString(),
        },
      });
    }
  }, [eta, points, deliveryRouteId, routeNumber]);

  const hasDriver = driverLat != null && driverLng != null;

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Timer className="h-4 w-4 text-muted-foreground" />
          Прогноз прибытия (ETA)
        </h3>
        <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${ETA_RISK_STYLES[overall]}`}>
          {overall === "late" ? <AlertTriangle className="h-3 w-3" /> : overall === "tight" ? <Clock className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
          {ETA_RISK_LABELS[overall]}
        </span>
      </div>

      {!hasDriver && (
        <div className="mb-3 rounded-md border border-dashed border-border p-2 text-xs text-muted-foreground">
          Геопозиция водителя ещё не передана — расчёт от планируемого отправления.
        </div>
      )}

      {eta.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
          Нет ожидаемых точек с координатами для расчёта ETA.
        </div>
      ) : (
        <div className="space-y-2">
          {eta.map((e) => {
            const meta = points.find((p) => p.point_number === e.point_number);
            return (
              <div
                key={e.point_number}
                className={`flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-xs ${ETA_RISK_STYLES[e.risk]}`}
              >
                <span className="font-semibold">№{e.point_number}</span>
                <span className="opacity-80">
                  {meta?.order_number ?? "—"} {meta?.contact_name ? `· ${meta.contact_name}` : ""}
                </span>
                <span className="ml-auto flex items-center gap-3">
                  <span title="Плановое время">
                    План: <span className="font-medium">{formatTime(e.planned_at)}</span>
                  </span>
                  <span title="Окно клиента">
                    Окно:{" "}
                    <span className="font-medium">
                      {e.window_from_iso ? formatTime(e.window_from_iso) : "—"}
                      {e.window_to_iso ? ` – ${formatTime(e.window_to_iso)}` : ""}
                    </span>
                  </span>
                  <span title="Расчётное ETA">
                    ETA: <span className="font-semibold">{formatTime(e.eta_at)}</span>
                  </span>
                  {e.risk === "late" && (
                    <span className="font-semibold">опоздание ~{e.delay_minutes} мин</span>
                  )}
                </span>
                {e.risk === "late" && e.window_to_iso && (
                  <div className="basis-full text-[11px] opacity-90">
                    Риск опоздания к клиенту (после {formatTime(e.window_to_iso)}).
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
