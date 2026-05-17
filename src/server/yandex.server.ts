/**
 * Server-side Yandex Maps wrappers.
 *
 * Production-архитектура:
 *  - НЕ используется SUPABASE_SERVICE_ROLE_KEY (на VPS его нет);
 *  - все обращения к БД идут через переданный user-context SupabaseClient
 *    (тот, что выдаёт api-helpers.requireAuth) — то есть от имени
 *    залогиненного пользователя;
 *  - чтение кэша — обычный SELECT, разрешённый RLS-политикой
 *    `*_cache_select_auth` для authenticated;
 *  - запись кэша — через SECURITY DEFINER RPC
 *    `upsert_geocode_cache` / `upsert_route_matrix_cache` /
 *    `upsert_route_geometry_cache`. Сами таблицы для прямой записи из
 *    клиента закрыты (нет INSERT/UPDATE policy).
 *  - ключи Яндекса читаются ТОЛЬКО из process.env внутри хендлеров.
 */
import "@/server/env-bootstrap.server";
import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type LngLat = { lat: number; lng: number };
type Sb = SupabaseClient<Database>;

const GEOCODER_URL = "https://geocode-maps.yandex.ru/1.x/";
const DISTANCE_MATRIX_URL = "https://api.routing.yandex.net/v2/distancematrix";
const ROUTING_URL = "https://api.routing.yandex.net/v2/route";

function hashKey(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function getGeocoderKey(): string {
  const k = process.env.YANDEX_GEOCODER_API_KEY ?? "";
  if (!k) throw new Error("YANDEX_GEOCODER_API_KEY is not configured");
  return k;
}
function getRoutingKey(): string {
  const k = process.env.YANDEX_ROUTING_API_KEY ?? "";
  if (!k) throw new Error("YANDEX_ROUTING_API_KEY is not configured");
  return k;
}

/* -------------------- geocode_cache helpers -------------------- */

type GeocodeRow = {
  lat: number | null;
  lng: number | null;
  formatted_address: string | null;
  raw: unknown;
};

async function readGeocodeCache(sb: Sb, key: string): Promise<GeocodeRow | null> {
  const { data } = await sb
    .from("geocode_cache")
    .select("lat,lng,formatted_address,raw")
    .eq("cache_key", key)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return (data as GeocodeRow | null) ?? null;
}

async function writeGeocodeCache(
  sb: Sb,
  key: string,
  kind: "forward" | "reverse",
  query: string,
  row: GeocodeRow,
): Promise<void> {
  // SECURITY DEFINER RPC — пишет в кэш без service_role.
  // Любая ошибка кэша не должна валить основной ответ Яндекса.
  const { error } = await sb.rpc("upsert_geocode_cache", {
    p_cache_key: key,
    p_kind: kind,
    p_query: query,
    p_lat: row.lat,
    p_lng: row.lng,
    p_formatted_address: row.formatted_address,
    p_raw: (row.raw ?? null),
    p_ttl_days: 90,
  } as never);
  if (error) console.warn("[yandex] geocode cache upsert failed:", error.message);
}

/* -------------------- geocoder -------------------- */

type YandexGeoResponse = {
  response?: {
    GeoObjectCollection?: {
      featureMember?: Array<{
        GeoObject?: {
          Point?: { pos?: string };
          metaDataProperty?: { GeocoderMetaData?: { text?: string } };
        };
      }>;
    };
  };
};

function parseFirstFeature(json: YandexGeoResponse): GeocodeRow {
  const fm = json.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject;
  const pos = fm?.Point?.pos;
  let lat: number | null = null;
  let lng: number | null = null;
  if (pos) {
    const [lngStr, latStr] = pos.split(" ");
    const ln = Number(lngStr);
    const la = Number(latStr);
    if (Number.isFinite(ln) && Number.isFinite(la)) {
      lng = ln;
      lat = la;
    }
  }
  const formatted = fm?.metaDataProperty?.GeocoderMetaData?.text ?? null;
  return { lat, lng, formatted_address: formatted, raw: json };
}

export async function geocodeAddress(sb: Sb, address: string): Promise<GeocodeRow> {
  const q = address.trim();
  if (!q) throw new Error("address is empty");
  const key = `fwd:${hashKey(q.toLowerCase())}`;
  const cached = await readGeocodeCache(sb, key);
  if (cached) return cached;

  const url = new URL(GEOCODER_URL);
  url.searchParams.set("apikey", getGeocoderKey());
  url.searchParams.set("format", "json");
  url.searchParams.set("geocode", q);
  url.searchParams.set("results", "1");
  url.searchParams.set("lang", "ru_RU");

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`yandex geocoder ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as YandexGeoResponse;
  const row = parseFirstFeature(json);
  await writeGeocodeCache(sb, key, "forward", q, row);
  return row;
}

export async function reverseGeocode(sb: Sb, coords: LngLat): Promise<GeocodeRow> {
  const { lat, lng } = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("invalid coords");
  }
  const q = `${lng.toFixed(6)},${lat.toFixed(6)}`;
  const key = `rev:${hashKey(q)}`;
  const cached = await readGeocodeCache(sb, key);
  if (cached) return cached;

  const url = new URL(GEOCODER_URL);
  url.searchParams.set("apikey", getGeocoderKey());
  url.searchParams.set("format", "json");
  url.searchParams.set("geocode", q);
  url.searchParams.set("results", "1");
  url.searchParams.set("lang", "ru_RU");
  url.searchParams.set("kind", "house");

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`yandex reverse geocoder ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as YandexGeoResponse;
  const row = parseFirstFeature(json);
  await writeGeocodeCache(sb, key, "reverse", q, row);
  return row;
}

/* -------------------- distance matrix -------------------- */

export type Matrix = {
  rows: Array<{
    elements: Array<{
      status: string;
      distance_m: number | null;
      duration_s: number | null;
    }>;
  }>;
};

function pointsKey(points: LngLat[]): string {
  return points.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join("|");
}

export async function distanceMatrix(
  sb: Sb,
  origins: LngLat[],
  destinations: LngLat[],
): Promise<Matrix> {
  if (origins.length === 0 || destinations.length === 0) {
    return { rows: [] };
  }
  const key = `dm:${hashKey(`${pointsKey(origins)}::${pointsKey(destinations)}`)}`;
  const { data: cached } = await sb
    .from("route_matrix_cache")
    .select("matrix")
    .eq("cache_key", key)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (cached?.matrix) return cached.matrix as unknown as Matrix;

  const url = new URL(DISTANCE_MATRIX_URL);
  url.searchParams.set("apikey", getRoutingKey());
  url.searchParams.set("origins", origins.map((p) => `${p.lat},${p.lng}`).join("|"));
  url.searchParams.set("destinations", destinations.map((p) => `${p.lat},${p.lng}`).join("|"));
  url.searchParams.set("mode", "driving");

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`yandex matrix ${res.status}: ${text.slice(0, 200)}`);
  }
  const raw = (await res.json()) as {
    rows?: Array<{
      elements?: Array<{
        status?: string;
        distance?: { value?: number };
        duration?: { value?: number };
      }>;
    }>;
  };
  const matrix: Matrix = {
    rows: (raw.rows ?? []).map((r) => ({
      elements: (r.elements ?? []).map((e) => ({
        status: e.status ?? "UNKNOWN",
        distance_m: e.distance?.value ?? null,
        duration_s: e.duration?.value ?? null,
      })),
    })),
  };

  const { error } = await sb.rpc("upsert_route_matrix_cache", {
    p_cache_key: key,
    p_origins: origins,
    p_destinations: destinations,
    p_matrix: matrix,
    p_ttl_days: 7,
  } as never);
  if (error) console.warn("[yandex] matrix cache upsert failed:", error.message);
  return matrix;
}

/* -------------------- routing (full route) -------------------- */

export type RouteGeometry = {
  distance_m: number | null;
  duration_s: number | null;
  geometry: Array<[number, number]>;
  segments: Array<{ distance_m: number | null; duration_s: number | null }>;
};

export async function buildRoute(sb: Sb, waypoints: LngLat[]): Promise<RouteGeometry> {
  if (waypoints.length < 2) throw new Error("need at least 2 waypoints");
  const key = `rt:${hashKey(pointsKey(waypoints))}`;
  const { data: cached } = await sb
    .from("route_geometry_cache")
    .select("distance_m,duration_s,geometry,segments")
    .eq("cache_key", key)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (cached) {
    const c = cached as unknown as {
      distance_m: number | null;
      duration_s: number | null;
      geometry: Array<[number, number]>;
      segments: RouteGeometry["segments"] | null;
    };
    return {
      distance_m: c.distance_m,
      duration_s: c.duration_s,
      geometry: c.geometry,
      segments: c.segments ?? [],
    };
  }

  const url = new URL(ROUTING_URL);
  url.searchParams.set("apikey", getRoutingKey());
  url.searchParams.set("waypoints", waypoints.map((p) => `${p.lat},${p.lng}`).join("|"));
  url.searchParams.set("mode", "driving");

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`yandex routing ${res.status}: ${text.slice(0, 200)}`);
  }
  const raw = (await res.json()) as {
    route?: {
      distance?: { value?: number };
      duration?: { value?: number };
      legs?: Array<{
        distance?: { value?: number };
        duration?: { value?: number };
        geometry?: { coordinates?: Array<[number, number]> };
      }>;
      geometry?: { coordinates?: Array<[number, number]> };
    };
  };

  const route = raw.route ?? {};
  const geom: Array<[number, number]> =
    route.geometry?.coordinates ??
    (route.legs ?? []).flatMap((l) => l.geometry?.coordinates ?? []);
  const segments = (route.legs ?? []).map((l) => ({
    distance_m: l.distance?.value ?? null,
    duration_s: l.duration?.value ?? null,
  }));
  const result: RouteGeometry = {
    distance_m: route.distance?.value ?? null,
    duration_s: route.duration?.value ?? null,
    geometry: geom,
    segments,
  };

  const { error } = await sb.rpc("upsert_route_geometry_cache", {
    p_cache_key: key,
    p_waypoints: waypoints,
    p_distance_m: result.distance_m,
    p_duration_s: result.duration_s,
    p_geometry: result.geometry,
    p_segments: result.segments,
    p_ttl_days: 7,
  } as never);
  if (error) console.warn("[yandex] route cache upsert failed:", error.message);
  return result;
}
