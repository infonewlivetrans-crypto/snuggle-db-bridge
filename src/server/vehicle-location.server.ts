/**
 * Серверный хелпер: подмешать координаты транспорта по городу местонахождения.
 *
 * ЖЁСТКОЕ ПРАВИЛО: для координат используются ТОЛЬКО поля текущего
 * местоположения транспорта:
 *   - current_city  (то, что водитель/перевозчик указал как «сейчас здесь»);
 *   - home_city     (домашний город транспорта, fallback).
 *
 * Никогда не используются:
 *   - ready_to_cities («Куда готов ехать»);
 *   - ready_comment / dispatcher_comment;
 *   - партиальные маршруты / города поиска грузов.
 *
 * Геокодирование — best-effort. Если Яндекс недоступен или возвращает
 * подозрительный результат (см. защиту от «дефолта Москвы»), запись
 * сохраняется без координат и транспорт попадает в блок «Без координат».
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
 * Геокодирует название города. Возвращает {lat, lng} или null, если ответ
 * Яндекса подозрительный (например, координаты центра Москвы для запроса
 * без слова «москва» — частый дефолт геокодера для неоднозначных запросов).
 */
export async function geocodeCityForVehicle(
  sb: Sb,
  rawCity: string,
): Promise<{ lat: number; lng: number } | null> {
  const city = rawCity.trim();
  if (!city) return null;
  // Добавляем «Россия, » если в запросе нет запятой — повышает шанс
  // правильного разрешения городов с одноимёнными топонимами.
  const query = city.includes(",") ? city : `Россия, ${city}`;

  try {
    const { geocodeAddress } = await import("@/server/yandex.server");
    const geo = await geocodeAddress(sb, query);
    if (!geo || !Number.isFinite(geo.lat as number) || !Number.isFinite(geo.lng as number)) {
      return null;
    }
    const lat = geo.lat as number;
    const lng = geo.lng as number;

    // Защита от «дефолта Москвы»: если запрос не про Москву, но координаты
    // ~центр Москвы — считаем геокодинг неудачным.
    const mentionsMoscow = /москв/i.test(city);
    const looksLikeMoscowCenter =
      lat >= 55.70 && lat <= 55.80 && lng >= 37.50 && lng <= 37.72;
    if (!mentionsMoscow && looksLikeMoscowCenter) {
      console.warn(
        `[vehicle-location] suspicious Moscow-center geocode for "${city}" — rejected`,
      );
      return null;
    }
    return { lat, lng };
  } catch (e) {
    console.warn("[vehicle-location] geocode failed:", (e as Error).message);
    return null;
  }
}

/**
 * Если в обновлении переданы город(а) местонахождения, но нет координат —
 * попробовать геокодировать. Не бросает исключений: при ошибке внешнего API
 * просто оставляет координаты null.
 *
 * Источники координат, по убыванию приоритета:
 *   1. Явные current_lat/current_lng — source: 'admin' или 'manual'.
 *   2. current_city — source: 'driver' / 'carrier' (по роли) / 'home_city'.
 *   3. home_city — source: 'home_city'.
 */
export async function enrichVehicleLocation(
  sb: Sb,
  update: Record<string, unknown>,
  callerRole: "admin" | "dispatcher" | "carrier" | "driver" = "dispatcher",
  opts: {
    vehicleId?: string | null;
    existing?: {
      current_city: string | null;
      current_lat: number | null;
      current_lng: number | null;
      location_source: string | null;
    } | null;
  } = {},
): Promise<void> {
  // Если нам передан id — подтягиваем текущее состояние, чтобы понять,
  // менялся ли current_city и стоит ли явная фиксация ('manual'/'admin').
  // Если existing передан явно — используем его и не делаем лишнего запроса
  // (важно для user-client, у которого RLS блокирует прямое чтение таблицы).
  let existing:
    | {
        current_city: string | null;
        current_lat: number | null;
        current_lng: number | null;
        location_source: string | null;
      }
    | null = opts.existing ?? null;
  if (!existing && opts.vehicleId) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (sb.from("dispatcher_vehicle_ext" as never) as any)
        .select("current_city,current_lat,current_lng,location_source")
        .eq("id", opts.vehicleId)
        .maybeSingle();
      existing = data ?? null;
    } catch (e) {
      console.warn("[vehicle-location] load existing failed:", (e as Error).message);
    }
  }

  const newCityRaw =
    "current_city" in update && typeof update.current_city === "string"
      ? (update.current_city as string).trim()
      : null;
  const cityProvided = "current_city" in update;
  const cityChanged =
    cityProvided &&
    existing != null &&
    (newCityRaw || null) !== ((existing.current_city ?? "").trim() || null);

  const explicitCoordsInPayload =
    update.current_lat != null &&
    update.current_lng != null &&
    Number.isFinite(Number(update.current_lat)) &&
    Number.isFinite(Number(update.current_lng));

  // Защита ручной фиксации: location_source='manual' (или 'admin') означает,
  // что координаты выставлены вручную и не должны перетираться авто-геокодом.
  // Исключение — пользователь явно меняет город ИЛИ присылает новые координаты.
  const isManuallyLocked =
    existing?.location_source === "manual" || existing?.location_source === "admin";

  if (explicitCoordsInPayload) {
    // Координаты выставлены явно — фиксируем как ручные.
    if (!update.location_source) {
      update.location_source = callerRole === "admin" ? "admin" : "manual";
    }
    update.location_updated_at = new Date().toISOString();
    return;
  }

  // Если город сменили — обязаны переехать: чистим старые координаты,
  // снимаем ручную фиксацию и пробуем геокодить заново.
  if (cityChanged) {
    update.current_lat = null;
    update.current_lng = null;
    if (existing?.location_source === "manual" || existing?.location_source === "admin") {
      // Город изменили вручную — старая ручная фиксация больше не актуальна.
      update.location_source = null;
    }
  } else if (isManuallyLocked && !cityProvided) {
    // Город не трогали, координаты зафиксированы вручную — ничего не делаем.
    return;
  }

  const currentCity =
    newCityRaw && newCityRaw.length > 0
      ? newCityRaw
      : !cityProvided && existing?.current_city
        ? existing.current_city
        : null;
  const homeCity =
    typeof update.home_city === "string" && update.home_city.trim()
      ? (update.home_city as string).trim()
      : null;

  const target = currentCity ?? homeCity;
  if (!target) {
    if (cityChanged) {
      update.location_updated_at = new Date().toISOString();
    }
    return;
  }

  const geo = await geocodeCityForVehicle(sb, target);
  if (!geo) {
    if (cityChanged) {
      // Не смогли геокодить новый город — оставляем без координат,
      // машина уйдёт в блок «Без координат», но это лучше чем старая точка.
      update.location_updated_at = new Date().toISOString();
    }
    return;
  }

  update.current_lat = geo.lat;
  update.current_lng = geo.lng;
  if (!update.location_source || cityChanged) {
    if (currentCity) {
      update.location_source =
        callerRole === "carrier"
          ? "carrier"
          : callerRole === "driver"
            ? "driver"
            : "home_city";
    } else {
      update.location_source = "home_city";
    }
  }
  update.location_updated_at = new Date().toISOString();
}
