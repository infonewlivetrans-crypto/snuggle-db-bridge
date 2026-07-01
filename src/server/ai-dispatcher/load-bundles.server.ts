// Логика связок грузов (bundles) для AI-диспетчера.
// dev/mock — данные приходят из mock-агента, реальный Radius Track Browser Agent
// подключается следующим этапом. API ATI не используется.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export interface VehicleCapacity {
  capacity_t?: number | null;
  volume_m3?: number | null;
  body_type?: string | null;
  loading_types?: string[] | null;
}

export interface BundleCandidateLike {
  id: string;
  weight?: number | null;
  volume?: number | null;
  price?: number | null;
  distance_km?: number | null;
  body_type?: string | null;
  loading_type?: string | null;
  pickup_city?: string | null;
  delivery_city?: string | null;
}

export interface CompatibilityReport {
  ok: boolean;
  warnings: string[];
  errors: string[];
  total_weight: number;
  total_volume: number;
  remaining_weight: number;
  remaining_volume: number;
}

export function checkLoadCompatibility(
  vehicle: VehicleCapacity,
  items: BundleCandidateLike[],
): CompatibilityReport {
  const capW = Number(vehicle.capacity_t ?? 0) * 1000; // t -> kg
  const capV = Number(vehicle.volume_m3 ?? 0);
  const totalW = items.reduce((s, i) => s + Number(i.weight ?? 0), 0);
  const totalV = items.reduce((s, i) => s + Number(i.volume ?? 0), 0);
  const warnings: string[] = [];
  const errors: string[] = [];
  if (capW > 0 && totalW > capW) errors.push(`Превышен тоннаж: ${totalW} кг > ${capW} кг`);
  if (capV > 0 && totalV > capV) errors.push(`Превышен объём: ${totalV} м³ > ${capV} м³`);
  if (vehicle.body_type) {
    for (const it of items) {
      if (it.body_type && it.body_type !== vehicle.body_type) {
        warnings.push(`Кузов «${it.body_type}» отличается от машины «${vehicle.body_type}»`);
      }
    }
  }
  if (vehicle.loading_types && vehicle.loading_types.length > 0) {
    for (const it of items) {
      if (it.loading_type && !vehicle.loading_types.includes(it.loading_type)) {
        warnings.push(`Тип загрузки «${it.loading_type}» отсутствует у машины`);
      }
    }
  }
  return {
    ok: errors.length === 0,
    warnings,
    errors,
    total_weight: totalW,
    total_volume: totalV,
    remaining_weight: Math.max(0, capW - totalW),
    remaining_volume: Math.max(0, capV - totalV),
  };
}

export function calculateBundleEconomics(
  _vehicle: VehicleCapacity,
  items: BundleCandidateLike[],
): {
  total_price: number;
  total_distance_km: number;
  total_profit: number;
  total_profit_per_km: number;
} {
  const total_price = items.reduce((s, i) => s + Number(i.price ?? 0), 0);
  const total_distance_km = items.reduce((s, i) => s + Number(i.distance_km ?? 0), 0);
  const fuelCost = total_distance_km * 15; // dev: 15 ₽/км расход
  const total_profit = Math.max(0, total_price - fuelCost);
  const total_profit_per_km = total_distance_km > 0
    ? Math.round((total_profit / total_distance_km) * 100) / 100
    : 0;
  return { total_price, total_distance_km, total_profit, total_profit_per_km };
}

export function detectBundleRisks(
  vehicle: VehicleCapacity,
  items: BundleCandidateLike[],
): string[] {
  const risks: string[] = [];
  const compat = checkLoadCompatibility(vehicle, items);
  if (compat.errors.length > 0) risks.push(...compat.errors);
  if (items.length > 3) risks.push("Более 3 грузов в цепочке — сложный маршрут");
  const cities = new Set(items.map((i) => i.pickup_city).filter(Boolean));
  if (cities.size > 2) risks.push("Погрузки в разных городах — риск по времени");
  return risks;
}

export function explainBundleMatch(
  vehicle: VehicleCapacity,
  items: BundleCandidateLike[],
): string {
  const econ = calculateBundleEconomics(vehicle, items);
  const cnt = items.length;
  return `Связка из ${cnt} груз(ов): ${econ.total_price} ₽ на ${econ.total_distance_km} км, ~${econ.total_profit_per_km} ₽/км прибыли`;
}

export async function buildLoadBundle(
  client: Client,
  dispatcherId: string,
  params: {
    vehicle: VehicleCapacity & { id?: string | null };
    searchTaskId?: string | null;
    mainCandidate: BundleCandidateLike;
    additionalCandidates?: BundleCandidateLike[];
    bundle_type?: string;
  },
): Promise<{ bundleId: string; report: CompatibilityReport }> {
  const c = client as AnyClient;
  const items = [params.mainCandidate, ...(params.additionalCandidates ?? [])];
  const report = checkLoadCompatibility(params.vehicle, items);
  const econ = calculateBundleEconomics(params.vehicle, items);
  const risks = detectBundleRisks(params.vehicle, items);
  const bundleType = params.bundle_type
    ?? (items.length === 1 ? "single_main" : items.length === 2 ? "main_plus_additional" : "multi_load_chain");

  const { data: bundle, error } = await c
    .from("ai_dispatch_load_bundles")
    .insert({
      dispatcher_id: dispatcherId,
      vehicle_id: params.vehicle.id ?? null,
      search_task_id: params.searchTaskId ?? null,
      bundle_type: bundleType,
      status: "suggested",
      total_price: econ.total_price,
      total_distance_km: econ.total_distance_km,
      total_weight: report.total_weight,
      total_volume: report.total_volume,
      remaining_weight: report.remaining_weight,
      remaining_volume: report.remaining_volume,
      total_profit: econ.total_profit,
      total_profit_per_km: econ.total_profit_per_km,
      risks_json: risks,
      ai_summary: explainBundleMatch(params.vehicle, items),
    })
    .select("id")
    .single();
  if (error || !bundle) throw new Error(error?.message ?? "cannot create bundle");

  const itemsPayload = items.map((it, i) => ({
    bundle_id: bundle.id,
    candidate_id: it.id,
    item_role: i === 0 ? "main" : "additional",
    sequence_number: i + 1,
    pickup_order: i + 1,
    delivery_order: i + 1,
    compatibility_status: report.ok ? "ok" : "warning",
    compatibility_warnings_json: report.warnings,
  }));
  await c.from("ai_dispatch_load_bundle_items").insert(itemsPayload);
  await c.from("ai_dispatch_load_candidates")
    .update({ bundle_id: bundle.id })
    .in("id", items.map((i) => i.id));

  return { bundleId: bundle.id, report };
}

export async function recalculateBundle(
  client: Client,
  bundleId: string,
): Promise<void> {
  const c = client as AnyClient;
  const { data: bundle } = await c.from("ai_dispatch_load_bundles").select("*").eq("id", bundleId).single();
  if (!bundle) return;
  const { data: items } = await c
    .from("ai_dispatch_load_bundle_items")
    .select("candidate_id")
    .eq("bundle_id", bundleId);
  const ids = (items ?? []).map((i: { candidate_id: string }) => i.candidate_id);
  if (ids.length === 0) return;
  const { data: cands } = await c
    .from("ai_dispatch_load_candidates")
    .select("id, weight, volume, price, distance_km, body_type, loading_type, pickup_city, delivery_city")
    .in("id", ids);
  const vehicle: VehicleCapacity = { capacity_t: null, volume_m3: null };
  if (bundle.vehicle_id) {
    const { data: v } = await c.from("vehicles").select("capacity_t, volume_m3, body_type").eq("id", bundle.vehicle_id).single();
    if (v) {
      vehicle.capacity_t = v.capacity_t;
      vehicle.volume_m3 = v.volume_m3;
      vehicle.body_type = v.body_type;
    }
  }
  const list = (cands ?? []) as BundleCandidateLike[];
  const rep = checkLoadCompatibility(vehicle, list);
  const econ = calculateBundleEconomics(vehicle, list);
  const risks = detectBundleRisks(vehicle, list);
  await c.from("ai_dispatch_load_bundles").update({
    total_price: econ.total_price,
    total_distance_km: econ.total_distance_km,
    total_weight: rep.total_weight,
    total_volume: rep.total_volume,
    remaining_weight: rep.remaining_weight,
    remaining_volume: rep.remaining_volume,
    total_profit: econ.total_profit,
    total_profit_per_km: econ.total_profit_per_km,
    risks_json: risks,
    ai_summary: explainBundleMatch(vehicle, list),
  }).eq("id", bundleId);
}
