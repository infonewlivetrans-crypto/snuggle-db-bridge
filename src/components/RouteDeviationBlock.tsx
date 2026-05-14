import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { distanceMeters } from "@/lib/gps";
import { formatCoords } from "@/lib/geo";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Navigation, Clock, MapPin } from "lucide-react";
import { toast } from "sonner";

const THRESHOLD_OPTIONS: { value: number; label: string }[] = [
  { value: 500, label: "500 метров" },
  { value: 1000, label: "1 км" },
  { value: 3000, label: "3 км" },
  { value: 5000, label: "5 км" },
];

const DEFAULT_THRESHOLD_M = 1000;
const NOTIFY_COOLDOWN_MS = 30 * 60 * 1000; // не чаще 1 уведомления / 30 мин на маршрут

type Point = {
  point_number: number;
  dp_status: string;
  order: { latitude: number | null; longitude: number | null } | null;
};

export function RouteDeviationBlock({
  deliveryRouteId,
  routeNumber,
  driverName,
  points,
  driverLat,
  driverLng,
  lastUpdateAt,
}: {
  deliveryRouteId: string;
  routeNumber: string;
  driverName: string | null;
  points: Point[];
  driverLat: number | null | undefined;
  driverLng: number | null | undefined;
  lastUpdateAt: string | null | undefined;
}) {
  const qc = useQueryClient();

  // Загружаем настройку порога
  const { data: thresholdSetting } = useQuery({
    queryKey: ["setting", "gps_deviation_threshold_m"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("id, setting_value")
        .eq("setting_key", "gps_deviation_threshold_m")
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; setting_value: unknown } | null;
    },
  });

  const thresholdM = useMemo(() => {
    const raw = thresholdSetting?.setting_value;
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_THRESHOLD_M;
  }, [thresholdSetting]);

  const saveThreshold = useMutation({
    mutationFn: async (value: number) => {
      if (thresholdSetting?.id) {
        const { error } = await supabase
          .from("system_settings")
          .update({ setting_value: value as never })
          .eq("id", thresholdSetting.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("system_settings").insert({
          setting_key: "gps_deviation_threshold_m",
          setting_value: value as never,
          description: "Порог отклонения водителя от ближайшей точки маршрута (метры)",
          category: "gps",
          is_public: true,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["setting", "gps_deviation_threshold_m"] });
      toast.success("Порог отклонения сохранён");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Ближайшая ожидаемая точка (не финальный статус) с координатами
  const nearest = useMemo(() => {
    if (driverLat == null || driverLng == null) return null;
    const FINAL = new Set(["delivered", "not_delivered", "returned_to_warehouse"]);
    const candidates = points
      .filter(
        (p) =>
          !FINAL.has(p.dp_status) &&
          typeof p.order?.latitude === "number" &&
          typeof p.order?.longitude === "number",
      )
      .map((p) => ({
        point_number: p.point_number,
        lat: p.order!.latitude as number,
        lng: p.order!.longitude as number,
        distance: distanceMeters(
          { latitude: driverLat, longitude: driverLng },
          { latitude: p.order!.latitude as number, longitude: p.order!.longitude as number },
        ),
      }));
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0];
  }, [points, driverLat, driverLng]);

  const hasDriver = driverLat != null && driverLng != null;
  const deviated = hasDriver && nearest != null && nearest.distance > thresholdM;

  // Создание уведомления логисту (с дебаунсом по маршруту)
  const lastNotifiedRef = useRef<number>(0);
  useEffect(() => {
    if (!deviated || !nearest) return;
    const now = Date.now();
    if (now - lastNotifiedRef.current < NOTIFY_COOLDOWN_MS) return;
    lastNotifiedRef.current = now;

    const payload = {
      delivery_route_id: deliveryRouteId,
      route_number: routeNumber,
      driver_name: driverName,
      driver_lat: driverLat,
      driver_lng: driverLng,
      nearest_point_number: nearest.point_number,
      nearest_lat: nearest.lat,
      nearest_lng: nearest.lng,
      distance_m: Math.round(nearest.distance),
      threshold_m: thresholdM,
      last_update_at: lastUpdateAt ?? null,
      recipients: ["logistician"],
      occurred_at: new Date().toISOString(),
    };

    void supabase.from("notifications").insert({
      kind: "driver_route_deviation",
      title: "Возможное отклонение водителя от маршрута",
      body: `Водитель по маршруту №${routeNumber} возможно отклонился от маршрута. До ближайшей точки №${nearest.point_number}: ${Math.round(nearest.distance)} м (порог ${thresholdM} м).`,
      payload,
    });
  }, [deviated, nearest, deliveryRouteId, routeNumber, driverName, driverLat, driverLng, thresholdM, lastUpdateAt]);

  const [thresholdLocal, setThresholdLocal] = useState<number>(thresholdM);
  useEffect(() => setThresholdLocal(thresholdM), [thresholdM]);

  const lastAt = lastUpdateAt ? new Date(lastUpdateAt) : null;

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Navigation className="h-4 w-4 text-muted-foreground" />
          Отклонение от маршрута
        </h3>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Порог:</span>
          <Select
            value={String(thresholdLocal)}
            onValueChange={(v) => {
              const num = Number(v);
              setThresholdLocal(num);
              saveThreshold.mutate(num);
            }}
          >
            <SelectTrigger className="h-8 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {THRESHOLD_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={String(o.value)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!hasDriver ? (
        <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
          Геопозиция водителя ещё не передавалась — отклонение не определяется.
        </div>
      ) : !nearest ? (
        <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
          Нет ожидаемых точек с координатами для сравнения.
        </div>
      ) : deviated ? (
        <div className="space-y-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm dark:border-red-800 dark:bg-red-900/20">
          <div className="flex items-start gap-2 text-red-900 dark:text-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="font-semibold">Возможное отклонение от маршрута</div>
          </div>
          <div className="grid grid-cols-1 gap-1 text-xs text-red-900 dark:text-red-200 sm:grid-cols-2">
            <Row label="Водитель" value={driverName ?? "—"} />
            <Row label="Маршрут" value={`№${routeNumber}`} />
            <Row
              label="Текущая позиция"
              value={formatCoords(driverLat as number, driverLng as number, 5)}
            />
            <Row
              label={`Ближайшая точка №${nearest.point_number}`}
              value={formatCoords(nearest.lat, nearest.lng, 5)}
            />
            <Row label="Расстояние" value={`${Math.round(nearest.distance)} м`} />
            <Row
              label="Обновлено"
              value={lastAt ? lastAt.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) : "—"}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-1 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200">
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5" />
            До ближайшей точки №{nearest.point_number}:{" "}
            <span className="font-semibold">{Math.round(nearest.distance)} м</span>
            <span className="text-xs opacity-75">(порог {thresholdM} м)</span>
          </div>
          {lastAt && (
            <div className="flex items-center gap-1 text-xs opacity-80">
              <Clock className="h-3 w-3" />
              Обновлено: {lastAt.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="opacity-70">{label}: </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
