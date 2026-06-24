// Готовность перевозчика к ЭПД (анкета + статус).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CarrierEpdReadinessStatus } from "@/lib/edo/scenarios";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

export interface CarrierEpdReadinessRow {
  id: string;
  carrier_ext_id: string;
  edo_operator: string | null;
  has_1c: boolean;
  onec_config: string | null;
  has_1c_edo: boolean;
  has_1c_epd: boolean;
  onec_epd_tariff: string | null;
  edo_participant_id: string | null;
  has_director_kep: boolean;
  has_mchd: boolean;
  responsible_person: string | null;
  driver_has_smartphone: boolean;
  driver_qr_ready: boolean;
  readiness_status: CarrierEpdReadinessStatus;
  last_checked_at: string | null;
  notes: string | null;
  updated_at: string;
}

export type ReadinessPatch = Partial<Omit<CarrierEpdReadinessRow, "id" | "carrier_ext_id" | "updated_at" | "readiness_status">>;

function computeStatus(r: Partial<CarrierEpdReadinessRow>): CarrierEpdReadinessStatus {
  if (!r.edo_operator) return "needs_edo_setup";
  if (!r.has_director_kep) return "needs_signature";
  if (!r.has_mchd) return "needs_mchd";
  if (!r.driver_qr_ready) return "needs_driver_app";
  if (!r.edo_participant_id) return "partial";
  return "ready";
}

export async function getReadiness(
  client: AnyClient, carrierExtId: string,
): Promise<CarrierEpdReadinessRow | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client.from("carrier_epd_readiness") as any)
    .select("*").eq("carrier_ext_id", carrierExtId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CarrierEpdReadinessRow | null) ?? null;
}

export async function upsertReadiness(
  client: AnyClient, carrierExtId: string, patch: ReadinessPatch,
): Promise<CarrierEpdReadinessRow> {
  const existing = await getReadiness(client, carrierExtId);
  const merged = { ...(existing ?? {}), ...patch, carrier_ext_id: carrierExtId };
  const status = computeStatus(merged);
  const row = {
    carrier_ext_id: carrierExtId,
    ...patch,
    readiness_status: status,
    last_checked_at: new Date().toISOString(),
  };
  if (existing) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (client.from("carrier_epd_readiness") as any)
      .update(row).eq("carrier_ext_id", carrierExtId).select("*").single();
    if (error) throw new Error(error.message);
    return data as CarrierEpdReadinessRow;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client.from("carrier_epd_readiness") as any)
    .insert(row).select("*").single();
  if (error) throw new Error(error.message);
  return data as CarrierEpdReadinessRow;
}
