import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, AlertTriangle } from "lucide-react";

/**
 * Базовый онлайн-трекинг водителя.
 * Запрашивает разрешение на геолокацию и периодически (раз в ~60 сек)
 * сохраняет координаты в driver_locations. Только когда маршрут активен.
 */
export function DriverGeoTracker({
  deliveryRouteId,
  driverName,
  active,
  intervalMs = 60_000,
}: {
  deliveryRouteId: string;
  driverName: string | null;
  active: boolean;
  intervalMs?: number;
}) {
  const [status, setStatus] = useState<"idle" | "asking" | "tracking" | "denied" | "unsupported" | "error">(
    "idle",
  );
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCoordsRef = useRef<{ lat: number; lng: number; acc?: number | null } | null>(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    if (!active) {
      cleanup();
      setStatus("idle");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unsupported");
      return;
    }
    setStatus("asking");

    const onPos = (pos: GeolocationPosition) => {
      lastCoordsRef.current = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        acc: pos.coords.accuracy ?? null,
      };
      setStatus("tracking");
    };
    const onErr = (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED) setStatus("denied");
      else setStatus("error");
    };

    try {
      watchIdRef.current = navigator.geolocation.watchPosition(onPos, onErr, {
        enableHighAccuracy: true,
        maximumAge: 30_000,
        timeout: 20_000,
      });
    } catch {
      setStatus("error");
    }

    const send = async () => {
      const c = lastCoordsRef.current;
      if (!c || sendingRef.current) return;
      sendingRef.current = true;
      try {
        const { error } = await supabase.from("driver_locations").insert({
          delivery_route_id: deliveryRouteId,
          driver_name: driverName,
          latitude: c.lat,
          longitude: c.lng,
          accuracy: c.acc ?? null,
          captured_at: new Date().toISOString(),
        });
        if (!error) setLastSentAt(new Date());
      } finally {
        sendingRef.current = false;
      }
    };

    // первый отправка через 5 сек, чтобы успеть получить координаты
    const initial = setTimeout(send, 5_000);
    timerRef.current = setInterval(send, intervalMs);

    return () => {
      clearTimeout(initial);
      cleanup();
    };

    function cleanup() {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (watchIdRef.current != null && typeof navigator !== "undefined" && navigator.geolocation) {
        try {
          navigator.geolocation.clearWatch(watchIdRef.current);
        } catch {
          /* noop */
        }
        watchIdRef.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, deliveryRouteId, driverName, intervalMs]);

  if (!active) return null;

  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs">
      <div className="flex items-center gap-2">
        {status === "tracking" ? (
          <>
            <MapPin className="h-3.5 w-3.5 text-emerald-600" />
            <span className="text-foreground">Геопозиция передаётся</span>
          </>
        ) : status === "asking" ? (
          <>
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Запрос геолокации…</span>
          </>
        ) : status === "denied" ? (
          <>
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            <span className="text-amber-700 dark:text-amber-300">
              Геолокация отключена. Менеджер не увидит вашу позицию.
            </span>
          </>
        ) : status === "unsupported" ? (
          <>
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            <span className="text-amber-700 dark:text-amber-300">
              Устройство не поддерживает геолокацию.
            </span>
          </>
        ) : status === "error" ? (
          <>
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            <span className="text-amber-700 dark:text-amber-300">Ошибка получения геопозиции.</span>
          </>
        ) : (
          <span className="text-muted-foreground">Ожидание…</span>
        )}
      </div>
      {lastSentAt && (
        <div className="mt-1 text-muted-foreground">
          Последняя отправка: {lastSentAt.toLocaleTimeString("ru-RU")}
        </div>
      )}
    </div>
  );
}
