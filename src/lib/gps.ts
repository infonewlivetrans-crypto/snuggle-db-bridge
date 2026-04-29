/**
 * Утилиты GPS для фиксации координат действий водителя.
 * Не подключает онлайн-трекинг — только разовый снимок координат при действии.
 */

export type GpsCoords = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  captured_at: string; // ISO
};

/** Получить текущие координаты устройства (один раз). Возвращает null, если GPS недоступен или отказано. */
export async function getCurrentCoords(timeoutMs = 8000): Promise<GpsCoords | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise<GpsCoords | null>((resolve) => {
    let done = false;
    const finish = (v: GpsCoords | null) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          finish({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? null,
            captured_at: new Date().toISOString(),
          });
        },
        () => finish(null),
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
      );
      // подстраховка
      setTimeout(() => finish(null), timeoutMs + 500);
    } catch {
      finish(null);
    }
  });
}

/** Расстояние между двумя координатами в метрах (формула гаверсинусов). */
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Порог "далеко от точки" в метрах. */
export const NEAR_POINT_THRESHOLD_METERS = 300;

export function formatCoords(c: { latitude: number; longitude: number }): string {
  return `${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}`;
}
