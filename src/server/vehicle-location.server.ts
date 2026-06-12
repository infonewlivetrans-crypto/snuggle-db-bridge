/**
 * Серверный хелпер: подмешать координаты транспорта по городу/адресу.
 *
 * Логика приоритета (от высшего к низшему):
 *   1. Явно переданные current_lat/current_lng (например, ручная правка админа) — source: 'admin' либо
 *      'manual', выставляется снаружи.
 *   2. current_city, указанный водителем — source: 'driver'.
 *   3. current_city, указанный перевозчиком — source: 'carrier'.
 *   4. home_city — source: 'home_city'.
 *
 * Геокодирование — best-effort. Если Яндекс недоступен, запись сохраняется без координат,
 * транспорт попадёт в блок «Без координат».
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Sb = SupabaseClient<Database>;

type LocationSource = "gps" | "driver" | "carrier" | "admin" | "home_city" | "manual";

export interface VehicleLocationPatch {
  current_city?: string | null;
  home_city?: string | null;
  current_lat?: number | null;
  current_lng?: number | null;
  location_source?: LocationSource | null;
  location_updated_at?: string;
}

/**
 * Если в обновлении переданы город(а), но нет координат — попробовать геокодировать.
 * Не бросает исключений: при ошибке внешнего API просто оставляет координаты null.
 */
export async function enrichVehicleLocation(
  sb: Sb,
  update: Record<string, unknown>,
  callerRole: "admin" | "dispatcher" | "carrier" | "driver" = "dispatcher",
): Promise<void> {
  const hasExplicitCoords =
    update.current_lat != null &&
    update.current_lng != null &&
    Number.isFinite(Number(update.current_lat)) &&
    Number.isFinite(Number(update.current_lng));

  if (hasExplicitCoords) {
    if (!update.location_source) {
      update.location_source = callerRole === "admin" ? "admin" : "manual";
    }
    update.location_updated_at = new Date().toISOString();
    return;
  }

  const currentCity =
    typeof update.current_city === "string" && update.current_city.trim()
      ? (update.current_city as string).trim()
      : null;
  const homeCity =
    typeof update.home_city === "string" && update.home_city.trim()
      ? (update.home_city as string).trim()
      : null;

  const target = currentCity ?? homeCity;
  if (!target) return;

  try {
    const { geocodeAddress } = await import("@/server/yandex.server");
    const geo = await geocodeAddress(sb, target);
    if (geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lng)) {
      update.current_lat = geo.lat;
      update.current_lng = geo.lng;
      if (!update.location_source) {
        if (currentCity) {
          update.location_source =
            callerRole === "carrier" ? "carrier" : callerRole === "driver" ? "driver" : "home_city";
        } else {
          update.location_source = "home_city";
        }
      }
      update.location_updated_at = new Date().toISOString();
    }
  } catch (e) {
    console.warn("[vehicle-location] geocode failed:", (e as Error).message);
  }
}
