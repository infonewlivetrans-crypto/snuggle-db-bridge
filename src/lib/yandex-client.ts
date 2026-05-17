/**
 * Тонкий клиент к нашему серверному API Яндекс-геокодера/маршрутизации.
 * Все запросы идут только на наш домен (radius-track.ru), браузер
 * НЕ обращается напрямую к api.yandex.* — это требование production-архитектуры
 * (серверные ключи ограничены IP VPS).
 */
import { authHeaders } from "@/lib/api-client";

async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    credentials: "include",
    headers: { ...(init.headers ?? {}), ...authHeaders() },
  });
}

export type LngLat = { lat: number; lng: number };

export type GeocodeResult = {
  lat: number | null;
  lng: number | null;
  formatted_address: string | null;
};

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const r = await apiFetch(`/api/geo/geocode?address=${encodeURIComponent(address)}`);
  if (!r.ok) throw new Error(`geocode ${r.status}`);
  return (await r.json()) as GeocodeResult;
}

export async function reverseGeocode(coords: LngLat): Promise<GeocodeResult> {
  const r = await apiFetch(
    `/api/geo/reverse?lat=${coords.lat}&lng=${coords.lng}`,
  );
  if (!r.ok) throw new Error(`reverse ${r.status}`);
  return (await r.json()) as GeocodeResult;
}

export type MatrixElement = {
  status: string;
  distance_m: number | null;
  duration_s: number | null;
};
export type Matrix = { rows: Array<{ elements: MatrixElement[] }> };

export async function distanceMatrix(
  origins: LngLat[],
  destinations: LngLat[],
): Promise<Matrix> {
  const r = await apiFetch(`/api/routing/matrix`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ origins, destinations }),
  });
  if (!r.ok) throw new Error(`matrix ${r.status}`);
  const j = (await r.json()) as { matrix: Matrix };
  return j.matrix;
}

export type RouteResult = {
  distance_m: number | null;
  duration_s: number | null;
  geometry: Array<[number, number]>;
  segments: Array<{ distance_m: number | null; duration_s: number | null }>;
};

export async function buildRoute(waypoints: LngLat[]): Promise<RouteResult> {
  const r = await apiFetch(`/api/routing/route`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ waypoints }),
  });
  if (!r.ok) throw new Error(`routing ${r.status}`);
  return (await r.json()) as RouteResult;
}
