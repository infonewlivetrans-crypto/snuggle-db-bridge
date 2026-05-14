import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Clock, AlertTriangle, Wifi, WifiOff } from "lucide-react";
import { yandexMapsUrl, formatCoords } from "@/lib/geo";

const STALE_MINUTES = 15;
const ONLINE_MINUTES = 3;

type Row = {
  last_driver_lat: number | null;
  last_driver_lng: number | null;
  last_driver_location_at: string | null;
};

/**
 * Блок «Геопозиция водителя» для менеджера/логиста.
 * Раз в 30 сек обновляет последнюю координату из delivery_routes.
 */
export function DriverGeoBlock({ deliveryRouteId }: { deliveryRouteId: string }) {
  const { data } = useQuery({
    queryKey: ["driver-geo", deliveryRouteId],
    refetchInterval: 30_000,
    queryFn: async (): Promise<Row | null> => {
      const { data, error } = await supabase
        .from("delivery_routes")
        .select("last_driver_lat, last_driver_lng, last_driver_location_at")
        .eq("id", deliveryRouteId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as Row | null;
    },
  });

  const lat = data?.last_driver_lat;
  const lng = data?.last_driver_lng;
  const at = data?.last_driver_location_at ? new Date(data.last_driver_location_at) : null;
  const ageMin = at ? (Date.now() - at.getTime()) / 60_000 : null;
  const isOnline = ageMin != null && ageMin <= ONLINE_MINUTES;
  const isStale = ageMin != null && ageMin > STALE_MINUTES;
  const hasCoords = typeof lat === "number" && typeof lng === "number";

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          Геопозиция водителя
        </h3>
        {ageMin == null ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
            <WifiOff className="h-3 w-3" /> нет данных
          </span>
        ) : isOnline ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">
            <Wifi className="h-3 w-3" /> онлайн
          </span>
        ) : isStale ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-100 px-2 py-0.5 text-xs font-medium text-red-900">
            <AlertTriangle className="h-3 w-3" /> давно не обновлялось
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
            <Clock className="h-3 w-3" /> {Math.round(ageMin)} мин назад
          </span>
        )}
      </div>

      {!hasCoords ? (
        <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
          Координаты водителя ещё не передавались.
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Координаты:</span>
            <span className="font-mono">{formatCoords(lat as number, lng as number, 5)}</span>
            <a
              href={yandexMapsUrl(lat as number, lng as number, 14)}
              target="_blank"
              rel="noreferrer"
              className="ml-auto text-xs text-primary hover:underline"
            >
              Открыть на Я.Картах
            </a>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>
              Обновлено:{" "}
              {at
                ? at.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })
                : "—"}
            </span>
          </div>
          {isStale && (
            <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Геопозиция водителя давно не обновлялась (более {STALE_MINUTES} минут).
            </div>
          )}
        </div>
      )}
    </div>
  );
}
