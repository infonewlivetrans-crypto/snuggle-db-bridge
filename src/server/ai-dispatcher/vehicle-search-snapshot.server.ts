// Snapshot параметров машины для запуска AI-поиска.
// Собирается один раз при создании задачи и записывается в
// ai_dispatch_search_tasks.vehicle_params_json. После создания задачи
// исторический snapshot не изменяем — редактирование карточки машины
// не должно ретроактивно влиять на уже идущий поиск.

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface VehicleSnapshotDriver {
  id: string | null;
  full_name: string | null;
  phone: string | null;
}
export interface VehicleSnapshotCarrier {
  id: string | null;
  name: string | null;
  inn: string | null;
  ati_id: string | null;
}
export interface VehicleSnapshotCapacity {
  payload_kg: number | null;
  volume_m3: number | null;
  length_m: number | null;
  width_m: number | null;
  height_m: number | null;
}
export interface VehicleSnapshotFuel {
  fuel_consumption_l_per_100km: number | null;
  fuel_price_per_l: number | null;
}
export interface VehicleSnapshotPosition {
  current_city: string | null;
  home_city: string | null;
  current_lat: number | null;
  current_lng: number | null;
  location_updated_at: string | null;
}
export interface VehicleSearchSnapshot {
  vehicle_id: string | null;
  vehicle_kind: string | null;
  body_type: string | null;
  loading_types: string[] | null;
  loading_restrictions: string | null;
  capacity: VehicleSnapshotCapacity;
  position: VehicleSnapshotPosition;
  ready_to_cities: string[] | null;
  ready_date: string | null;
  ready_comment: string | null;
  driver: VehicleSnapshotDriver;
  carrier: VehicleSnapshotCarrier;
  fuel: VehicleSnapshotFuel;
  rates: {
    minimum_trip_rate: number | null;
    minimum_km_rate: number | null;
  };
  dispatcher_comment: string | null;
  source: "vehicle_card";
  created_at: string;
}

/** Fields the search UI expects; empty means "not enough info to start". */
const REQUIRED_FIELDS = [
  "vehicle_kind",
  "body_type",
  "capacity.payload_kg",
  "position.current_city_or_home_city",
] as const;

export interface VehicleSnapshotWithMissing {
  snapshot: VehicleSearchSnapshot;
  missing_fields: string[];
}

/** Build a snapshot from a dispatcher_vehicle_ext row with driver/carrier joins. */
export function buildVehicleSearchSnapshot(row: any, driver: any, carrier: any): VehicleSearchSnapshot {
  return {
    vehicle_id: row?.id ?? null,
    vehicle_kind: row?.vehicle_kind ?? null,
    body_type: row?.body_type ?? null,
    loading_types: Array.isArray(row?.load_methods) ? row.load_methods : null,
    loading_restrictions: row?.loading_restrictions ?? null,
    capacity: {
      payload_kg: row?.payload_kg ?? null,
      volume_m3: row?.volume_m3 ?? null,
      length_m: row?.length_m ?? null,
      width_m: row?.width_m ?? null,
      height_m: row?.height_m ?? null,
    },
    position: {
      current_city: row?.current_city ?? null,
      home_city: row?.home_city ?? null,
      current_lat: row?.current_lat ?? null,
      current_lng: row?.current_lng ?? null,
      location_updated_at: row?.location_updated_at ?? null,
    },
    ready_to_cities: Array.isArray(row?.ready_to_cities) ? row.ready_to_cities : null,
    ready_date: row?.ready_date ?? null,
    ready_comment: row?.ready_comment ?? null,
    driver: {
      id: driver?.id ?? null,
      full_name: driver?.full_name ?? null,
      phone: driver?.phone ?? null,
    },
    carrier: {
      id: carrier?.id ?? null,
      name: carrier?.name ?? null,
      inn: carrier?.inn ?? null,
      ati_id: carrier?.ati_id ?? null,
    },
    fuel: {
      fuel_consumption_l_per_100km: row?.fuel_consumption_l_per_100km ?? null,
      fuel_price_per_l: row?.fuel_price_per_l ?? null,
    },
    rates: {
      minimum_trip_rate: row?.minimum_trip_rate ?? null,
      minimum_km_rate: row?.minimum_km_rate ?? null,
    },
    dispatcher_comment: row?.dispatcher_comment ?? null,
    source: "vehicle_card",
    created_at: new Date().toISOString(),
  };
}

/** Load vehicle with driver + carrier joins, return snapshot + missing fields list. */
export async function getVehicleSearchSnapshot(
  client: any,
  vehicleId: string,
): Promise<VehicleSnapshotWithMissing | null> {
  const { data: v } = await client
    .from("dispatcher_vehicle_ext")
    .select(
      "id, vehicle_kind, body_type, payload_kg, volume_m3, length_m, width_m, height_m, " +
        "load_methods, loading_restrictions, home_city, current_city, current_lat, current_lng, " +
        "location_updated_at, ready_to_cities, ready_date, ready_comment, " +
        "dispatcher_driver_ext_id, dispatcher_carrier_ext_id, " +
        "fuel_consumption_l_per_100km, fuel_price_per_l, " +
        "minimum_trip_rate, minimum_km_rate, dispatcher_comment",
    )
    .eq("id", vehicleId)
    .maybeSingle();
  if (!v) return null;

  const [driverRes, carrierRes] = await Promise.all([
    v.dispatcher_driver_ext_id
      ? client
          .from("dispatcher_driver_ext")
          .select("id, full_name, phone")
          .eq("id", v.dispatcher_driver_ext_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    v.dispatcher_carrier_ext_id
      ? client
          .from("dispatcher_carrier_ext")
          .select("id, name, inn, ati_id")
          .eq("id", v.dispatcher_carrier_ext_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const snapshot = buildVehicleSearchSnapshot(v, driverRes.data, carrierRes.data);
  return { snapshot, missing_fields: listMissingVehicleSearchFields(snapshot) };
}

/** Return list of REQUIRED_FIELDS that are missing on the snapshot. */
export function listMissingVehicleSearchFields(s: VehicleSearchSnapshot): string[] {
  const missing: string[] = [];
  if (!s.vehicle_kind) missing.push("vehicle_kind");
  if (!s.body_type) missing.push("body_type");
  if (s.capacity.payload_kg == null) missing.push("capacity.payload_kg");
  if (!s.position.current_city && !s.position.home_city)
    missing.push("position.current_city_or_home_city");
  return missing;
}

export function validateVehicleSearchSnapshot(s: VehicleSearchSnapshot): {
  ok: boolean;
  missing: string[];
} {
  const missing = listMissingVehicleSearchFields(s);
  return { ok: missing.length === 0, missing };
}
void REQUIRED_FIELDS;

/**
 * Build a minimal ATI filter object suitable for the browser agent to
 * pre-fill the search form. Diagnostic only — real selectors are handled
 * on the extension side; this is just structured input.
 */
export function buildAtiFiltersFromVehicle(s: VehicleSearchSnapshot): Record<string, unknown> {
  const fromCity = s.position.current_city ?? s.position.home_city ?? null;
  return {
    from_city: fromCity,
    to_cities: s.ready_to_cities ?? null,
    body_type: s.body_type,
    loading_types: s.loading_types,
    payload_kg: s.capacity.payload_kg,
    volume_m3: s.capacity.volume_m3,
    length_m: s.capacity.length_m,
    width_m: s.capacity.width_m,
    height_m: s.capacity.height_m,
    ready_date: s.ready_date,
  };
}

/** Detect existing active AI search tasks for a vehicle (for dedup UX). */
export async function listActiveTasksForVehicle(client: any, vehicleId: string): Promise<
  Array<{ id: string; status: string; search_mode: string; created_at: string; destination_city: string | null }>
> {
  const { data } = await client
    .from("ai_dispatch_search_tasks")
    .select("id, status, search_mode, created_at, destination_city")
    .eq("vehicle_id", vehicleId)
    .in("status", ["draft", "starting", "searching", "main_found", "paused"])
    .order("created_at", { ascending: false })
    .limit(5);
  return (data ?? []) as any;
}
