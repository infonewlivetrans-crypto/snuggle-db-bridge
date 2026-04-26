/** Утилиты для работы с координатами и ссылками на карты/навигаторы. */

export type Coords = { lat: number; lng: number };

export function hasCoords(o: {
  latitude: number | null;
  longitude: number | null;
}): o is { latitude: number; longitude: number } {
  return typeof o.latitude === "number" && typeof o.longitude === "number";
}

export function formatCoords(lat: number, lng: number, digits = 6): string {
  return `${lat.toFixed(digits)}, ${lng.toFixed(digits)}`;
}

/** Парсит "55.7558, 37.6173" / "55.7558 37.6173" / "55.7558;37.6173". */
export function parseCoords(input: string): Coords | null {
  const m = input
    .trim()
    .replace(",", " ")
    .replace(";", " ")
    .split(/\s+/)
    .filter(Boolean);
  if (m.length !== 2) return null;
  const lat = Number(m[0]);
  const lng = Number(m[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function yandexMapsUrl(lat: number, lng: number, zoom = 17): string {
  return `https://yandex.ru/maps/?pt=${lng},${lat}&z=${zoom}&l=map`;
}

export function yandexNavigatorUrl(lat: number, lng: number): string {
  // Открывается в приложении Я.Навигатор; в вебе откроется Я.Карты.
  return `yandexnavi://build_route_on_map?lat_to=${lat}&lon_to=${lng}`;
}

export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function googleNavigateUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

export function dgisUrl(lat: number, lng: number): string {
  return `https://2gis.ru/geo/${lng},${lat}`;
}

/** Встраиваемая статическая карта Yandex (без ключа). */
export function yandexStaticMapUrl(
  lat: number,
  lng: number,
  opts: { width?: number; height?: number; zoom?: number } = {},
): string {
  const { width = 600, height = 240, zoom = 16 } = opts;
  return `https://static-maps.yandex.ru/1.x/?ll=${lng},${lat}&z=${zoom}&size=${width},${height}&l=map&pt=${lng},${lat},pm2rdl`;
}
