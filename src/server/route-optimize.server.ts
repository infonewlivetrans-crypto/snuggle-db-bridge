/**
 * Простая серверная оптимизация порядка точек маршрута.
 *
 * Используется при импорте маршрутного листа сразу после вставки
 * route_points, чтобы записать оптимальный порядок в point_number.
 *
 * Алгоритм: nearest-neighbour по Haversine (без внешних API/ключей).
 * - Точки без координат сохраняют относительный порядок и идут в конец.
 * - Стартом берём первую точку из исходного порядка (обычно ближайшая
 *   к складу/началу маршрута по 1С). Если у неё нет координат —
 *   первую попавшуюся с координатами.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Sb = SupabaseClient<Database>;

export type OptimizeInputPoint = {
  id: string;
  lat: number | null;
  lng: number | null;
};

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Возвращает упорядоченный массив id точек (оптимальный порядок). */
export function nearestNeighbourOrder(points: OptimizeInputPoint[]): string[] {
  const withCoords = points.filter(
    (p): p is OptimizeInputPoint & { lat: number; lng: number } =>
      typeof p.lat === "number" && typeof p.lng === "number",
  );
  const withoutCoords = points.filter(
    (p) => typeof p.lat !== "number" || typeof p.lng !== "number",
  );

  if (withCoords.length <= 2) {
    return [...withCoords.map((p) => p.id), ...withoutCoords.map((p) => p.id)];
  }

  const remaining = new Map(withCoords.map((p) => [p.id, p]));
  const ordered: string[] = [];
  // Стартуем с первой точки исходного порядка, у которой есть координаты.
  const start = withCoords[0];
  ordered.push(start.id);
  remaining.delete(start.id);
  let current = start;

  while (remaining.size > 0) {
    let bestId: string | null = null;
    let bestKm = Infinity;
    for (const p of remaining.values()) {
      const d = haversineKm(current, p);
      if (d < bestKm) {
        bestKm = d;
        bestId = p.id;
      }
    }
    if (!bestId) break;
    const next = remaining.get(bestId)!;
    ordered.push(bestId);
    remaining.delete(bestId);
    current = next;
  }

  return [...ordered, ...withoutCoords.map((p) => p.id)];
}

/**
 * Читает все route_points маршрута, вычисляет оптимальный порядок и
 * UPDATE-ит point_number. Безопасно к вызову при любом числе точек.
 *
 * Возвращает количество переупорядоченных точек или null, если оптимизация
 * не понадобилась (≤1 точки с координатами).
 */
export async function optimizeRoutePoints(
  sb: Sb,
  routeId: string,
): Promise<{ reordered: number; withoutCoords: number } | null> {
  const { data, error } = await sb
    .from("route_points")
    .select("id, point_number, order:order_id(latitude, longitude)")
    .eq("route_id", routeId)
    .order("point_number", { ascending: true });
  if (error || !data) return null;

  const input: OptimizeInputPoint[] = (data as unknown as Array<{
    id: string;
    order: { latitude: number | null; longitude: number | null } | null;
  }>).map((row) => ({
    id: row.id,
    lat: row.order?.latitude ?? null,
    lng: row.order?.longitude ?? null,
  }));

  const withoutCoords = input.filter(
    (p) => typeof p.lat !== "number" || typeof p.lng !== "number",
  ).length;
  const withCoordsCount = input.length - withoutCoords;
  if (withCoordsCount <= 1) return null;

  const ordered = nearestNeighbourOrder(input);

  // Двухпроходный апдейт, чтобы не нарушать возможный UNIQUE(route_id, point_number):
  // 1) переводим все точки во временный диапазон (отрицательные номера);
  // 2) проставляем итоговый порядок 1..N.
  for (let i = 0; i < ordered.length; i++) {
    await sb
      .from("route_points")
      .update({ point_number: -(i + 1) } as never)
      .eq("id", ordered[i]);
  }
  for (let i = 0; i < ordered.length; i++) {
    await sb
      .from("route_points")
      .update({ point_number: i + 1 } as never)
      .eq("id", ordered[i]);
  }

  return { reordered: ordered.length, withoutCoords };
}

// =============================================================================
// Optimization with time windows (используется на странице /routes/:id логиста).
// =============================================================================

export type TwOptimizePoint = {
  id: string;
  lat: number | null;
  lng: number | null;
  windowFromMs: number | null;
  windowToMs: number | null;
  serviceMinutes: number;
};

export type TwOptimizeResult = {
  ordered: string[];
  skippedNoCoords: number;
  warnings: string[];
};

function haversineKmTW(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Nearest-neighbour с штрафами за нарушение клиентского окна доставки.
 * score = distanceKm + latePenalty + earlyPenalty.
 * latePenalty значительно больше — система избегает опоздания к клиенту.
 */
export function nearestNeighbourWithTimeWindows(args: {
  points: TwOptimizePoint[];
  start: { lat: number; lng: number } | null;
  startTimeMs: number;
  avgSpeedKmh: number;
  defaultServiceMinutes: number;
}): TwOptimizeResult {
  const { points, start, startTimeMs, avgSpeedKmh, defaultServiceMinutes } = args;
  const warnings: string[] = [];
  const withCoords = points.filter(
    (p): p is TwOptimizePoint & { lat: number; lng: number } =>
      typeof p.lat === "number" && typeof p.lng === "number",
  );
  const withoutCoords = points.filter(
    (p) => typeof p.lat !== "number" || typeof p.lng !== "number",
  );

  if (withCoords.length === 0) {
    return {
      ordered: withoutCoords.map((p) => p.id),
      skippedNoCoords: withoutCoords.length,
      warnings,
    };
  }

  const speed = Math.max(1, avgSpeedKmh || 40);
  const remaining = new Map(withCoords.map((p) => [p.id, p]));
  const ordered: string[] = [];

  let current: { lat: number; lng: number } =
    start ?? { lat: withCoords[0].lat, lng: withCoords[0].lng };
  let currentTimeMs = startTimeMs;

  // Если нет склада/стартовой точки — берём первую с координатами как старт.
  if (!start) {
    const seed = withCoords[0];
    ordered.push(seed.id);
    remaining.delete(seed.id);
    current = { lat: seed.lat, lng: seed.lng };
    const svc = (seed.serviceMinutes || defaultServiceMinutes) * 60_000;
    currentTimeMs += svc;
  }

  while (remaining.size > 0) {
    let bestId: string | null = null;
    let bestScore = Infinity;
    let bestArrivalMs = currentTimeMs;
    let bestOutOfWindow = false;

    for (const p of remaining.values()) {
      const distanceKm = haversineKmTW(current, p);
      const travelMs = (distanceKm / speed) * 3_600_000;
      const arrivalMs = currentTimeMs + travelMs;

      let latePenalty = 0;
      let earlyPenalty = 0;
      let outOfWindow = false;
      if (p.windowToMs != null && arrivalMs > p.windowToMs) {
        const lateMin = (arrivalMs - p.windowToMs) / 60_000;
        latePenalty = 1000 + lateMin * 5; // большой штраф за опоздание
        outOfWindow = true;
      }
      if (p.windowFromMs != null && arrivalMs < p.windowFromMs) {
        const earlyMin = (p.windowFromMs - arrivalMs) / 60_000;
        earlyPenalty = earlyMin * 0.1; // мягкий штраф за ранний приезд
      }
      const score = distanceKm + latePenalty + earlyPenalty;
      if (score < bestScore) {
        bestScore = score;
        bestId = p.id;
        bestArrivalMs = arrivalMs;
        bestOutOfWindow = outOfWindow;
      }
    }
    if (!bestId) break;
    const next = remaining.get(bestId)!;
    ordered.push(bestId);
    remaining.delete(bestId);
    if (bestOutOfWindow) {
      warnings.push(`Точка ${bestId} — вне окна клиента`);
    }
    current = { lat: next.lat, lng: next.lng };
    const svc = (next.serviceMinutes || defaultServiceMinutes) * 60_000;
    // Если приехали раньше окна — ждём до начала окна перед сервисом.
    const effectiveStart =
      next.windowFromMs != null && bestArrivalMs < next.windowFromMs
        ? next.windowFromMs
        : bestArrivalMs;
    currentTimeMs = effectiveStart + svc;
  }

  return {
    ordered: [...ordered, ...withoutCoords.map((p) => p.id)],
    skippedNoCoords: withoutCoords.length,
    warnings,
  };
}

/** Двухфазный безопасный апдейт point_number, чтобы не конфликтовать с UNIQUE. */
export async function applyRoutePointsOrder(
  sb: import("@supabase/supabase-js").SupabaseClient<
    import("@/integrations/supabase/types").Database
  >,
  orderedIds: string[],
): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await sb
      .from("route_points")
      .update({ point_number: -(i + 1) } as never)
      .eq("id", orderedIds[i]);
  }
  for (let i = 0; i < orderedIds.length; i++) {
    await sb
      .from("route_points")
      .update({ point_number: i + 1 } as never)
      .eq("id", orderedIds[i]);
  }
}
