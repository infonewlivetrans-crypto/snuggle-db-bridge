/**
 * Server-side Yandex Maps wrappers.
 *
 * Принципы:
 *  - все ключи читаются ТОЛЬКО из process.env внутри хендлеров (никаких import-time чтений);
 *  - наружу из браузера эти ключи не попадают;
 *  - все ответы кэшируются в БД (geocode_cache / route_matrix_cache / route_geometry_cache);
 *  - используется service-role клиент только для записи в кэш (RLS read-only для authenticated).
 */
import "@/server/env-bootstrap.server";
import { createHash } from "crypto";
import { makeAdminClient } from "@/server/api-helpers.server";

export type LngLat = { lat: number; lng: number };

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

async function readGeocodeCache(key: string): Promise<GeocodeRow | null> {
  const admin = makeAdminClient();
  const { data } = await admin
    .from("geocode_cache")
    .select("lat,lng,formatted_address,raw,expires_at")
    .eq("cache_key", key)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return (data as GeocodeRow | null) ?? null;
}

async function writeGeocodeCache(
  key: string,
  kind: "forward" | "reverse",
  query: string,
  row: GeocodeRow,
): Promise<void> {
  const admin = makeAdminClient();
  await admin.from("geocode_cache").upsert(
    {
      cache_key: key,
      kind,
      query,
      lat: row.lat,
      lng: row.lng,
      formatted_address: row.formatted_address,
      raw: row.raw as never,
    },
    { onConflict: "cache_key" },
  );
}

/* -------------------- geocoder -------------------- */

type YandexGeoResponse = {
  response?: {
    GeoObjectCollection?: {
      featureMember?: Array<{
        GeoObject?: {
          Point?: { pos?: string };
          metaDataProperty?: {
            GeocoderMetaData?: { text?: string };
          };
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

export async function geocodeAddress(address: string): Promise<GeocodeRow> {
  const q = address.trim();
  if (!q) throw new Error("address is empty");
  const key = `fwd:${hashKey(q.toLowerCase())}`;
  const cached = await readGeocodeCache(key);
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
  await writeGeocodeCache(key, "forward", q, row);
  return row;
}

export async function reverseGeocode(coords: LngLat): Promise<GeocodeRow> {
  const { lat, lng } = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("invalid coords");
  }
  const q = `${lng.toFixed(6)},${lat.toFixed(6)}`;
  const key = `rev:${hashKey(q)}`;
  const cached = await readGeocodeCache(key);
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
  await writeGeocodeCache(key, "reverse", q, row);
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
  origins: LngLat[],
  destinations: LngLat[],
): Promise<Matrix> {
  if (origins.length === 0 || destinations.length === 0) {
    return { rows: [] };
  }
  const key = `dm:${hashKey(`${pointsKey(origins)}::${pointsKey(destinations)}`)}`;
  const admin = makeAdminClient();
  const { data: cached } = await admin
    .from("route_matrix_cache")
    .select("matrix,expires_at")
    .eq("cache_key", key)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (cached?.matrix) return cached.matrix as unknown as Matrix;

  const url = new URL(DISTANCE_MATRIX_URL);
  url.searchParams.set("apikey", getRoutingKey());
  url.searchParams.set(
    "origins",
    origins.map((p) => `${p.lat},${p.lng}`).join("|"),
  );
  url.searchParams.set(
    "destinations",
    destinations.map((p) => `${p.lat},${p.lng}`).join("|"),
  );
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

  await admin.from("route_matrix_cache").upsert(
    {
      cache_key: key,
      origins: origins as never,
      destinations: destinations as never,
      matrix: matrix as never,
    },
    { onConflict: "cache_key" },
  );
  return matrix;
}

/* -------------------- routing (full route) -------------------- */

export type RouteGeometry = {
  distance_m: number | null;
  duration_s: number | null;
  geometry: Array<[number, number]>; // [lng, lat]
  segments: Array<{ distance_m: number | null; duration_s: number | null }>;
  raw?: unknown;
};

export async function buildRoute(waypoints: LngLat[]): Promise<RouteGeometry> {
  if (waypoints.length < 2) throw new Error("need at least 2 waypoints");
  const key = `rt:${hashKey(pointsKey(waypoints))}`;
  const admin = makeAdminClient();
  const { data: cached } = await admin
    .from("route_geometry_cache")
    .select("distance_m,duration_s,geometry,segments,expires_at")
    .eq("cache_key", key)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (cached) {
    return {
      distance_m: (cached as { distance_m: number | null }).distance_m,
      duration_s: (cached as { duration_s: number | null }).duration_s,
      geometry: (cached as { geometry: Array<[number, number]> }).geometry,
      segments:
        ((cached as { segments: RouteGeometry["segments"] | null }).segments ?? []),
    };
  }

  const url = new URL(ROUTING_URL);
  url.searchParams.set("apikey", getRoutingKey());
  url.searchParams.set(
    "waypoints",
    waypoints.map((p) => `${p.lat},${p.lng}`).join("|"),
  );
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
    raw,
  };

  await admin.from("route_geometry_cache").upsert(
    {
      cache_key: key,
      waypoints: waypoints as never,
      distance_m: result.distance_m,
      duration_s: result.duration_s,
      geometry: result.geometry as never,
      segments: result.segments as never,
    },
    { onConflict: "cache_key" },
  );
  return result;
}
