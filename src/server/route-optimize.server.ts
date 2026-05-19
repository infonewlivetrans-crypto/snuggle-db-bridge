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
