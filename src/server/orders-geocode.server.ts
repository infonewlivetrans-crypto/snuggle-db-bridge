/**
 * Пакетное геокодирование заказов:
 *  - читает заказы с пустыми latitude/longitude;
 *  - подмешивает контекст: адрес клиента + default region из system_settings;
 *  - пишет lat/lng/landmarks обратно в orders (через user-context client,
 *    RLS пропускает свои записи как обычный UPDATE).
 *
 * НЕ использует service_role: всё через переданный sb (тот, что выдал
 * requireAuth в роуте), как в архитектуре Пакета 1.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { geocodeOrderRow } from "@/server/order-geocode.server";

type Sb = SupabaseClient<Database>;

export type GeocodeBatchUpdated = {
  id: string;
  order_number: string;
  lat: number;
  lng: number;
  formatted_address: string | null;
};

export type GeocodeBatchFailed = {
  id: string;
  order_number: string;
  address: string | null;
  reason: "no_address" | "not_found" | "update_error";
};

export type GeocodeBatchResult = {
  updated: GeocodeBatchUpdated[];
  failed: GeocodeBatchFailed[];
  skipped: number;
};

/** Читает строковое значение system_settings.default_geocode_region. */
async function readDefaultRegion(sb: Sb): Promise<string | null> {
  try {
    const { data } = await sb
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "default_geocode_region")
      .maybeSingle();
    const v = data?.setting_value;
    if (typeof v === "string") return v;
    if (v && typeof v === "object" && "value" in (v as Record<string, unknown>)) {
      const inner = (v as Record<string, unknown>).value;
      if (typeof inner === "string") return inner;
    }
    return null;
  } catch {
    return null;
  }
}

export async function geocodeOrdersByIds(
  sb: Sb,
  orderIds: string[],
): Promise<GeocodeBatchResult> {
  const result: GeocodeBatchResult = { updated: [], failed: [], skipped: 0 };
  if (orderIds.length === 0) return result;

  const { data: orders, error } = await sb
    .from("orders")
    .select("id, order_number, delivery_address, latitude, longitude, client_id, landmarks")
    .in("id", orderIds);
  if (error) throw new Error(`orders load failed: ${error.message}`);

  const todo = (orders ?? []).filter(
    (o) => o.latitude == null || o.longitude == null,
  );
  result.skipped = (orders ?? []).length - todo.length;
  if (todo.length === 0) return result;

  // Адреса клиентов одним запросом
  const clientIds = Array.from(
    new Set(todo.map((o) => o.client_id).filter((x): x is string => !!x)),
  );
  const clientAddrById = new Map<string, string | null>();
  if (clientIds.length > 0) {
    const { data: clients } = await sb
      .from("clients")
      .select("id, address")
      .in("id", clientIds);
    for (const c of clients ?? []) clientAddrById.set(c.id, c.address ?? null);
  }

  const defaultRegion = (await readDefaultRegion(sb)) ?? "Краснодарский край";

  for (const o of todo) {
    const addr = (o.delivery_address ?? "").trim();
    if (!addr) {
      result.failed.push({
        id: o.id,
        order_number: o.order_number,
        address: null,
        reason: "no_address",
      });
      continue;
    }
    const outcome = await geocodeOrderRow(sb, addr, {
      clientAddress: o.client_id ? clientAddrById.get(o.client_id) ?? null : null,
      defaultRegion,
    });
    if (!outcome) {
      result.failed.push({
        id: o.id,
        order_number: o.order_number,
        address: addr,
        reason: "not_found",
      });
      continue;
    }
    const { error: upErr } = await sb
      .from("orders")
      .update({
        latitude: outcome.lat,
        longitude: outcome.lng,
        landmarks: o.landmarks ?? outcome.formatted_address,
      })
      .eq("id", o.id);
    if (upErr) {
      result.failed.push({
        id: o.id,
        order_number: o.order_number,
        address: addr,
        reason: "update_error",
      });
      continue;
    }
    result.updated.push({
      id: o.id,
      order_number: o.order_number,
      lat: outcome.lat,
      lng: outcome.lng,
      formatted_address: outcome.formatted_address,
    });
  }

  return result;
}
