// Сервер-сайд сборщик payload-а для buildCarrierRequestContractText.
// Никаких новых таблиц: читаем dispatcher_carrier_requests + ext + (deal).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  buildCarrierRequestContractText,
  carrierRequestContractSubject,
  type CarrierRequestContractPayload,
} from "@/lib/dispatcher/carrier-request";

export interface ContractPreviewResult {
  ok: true;
  subject: string;
  contract_text: string;
  request: Record<string, unknown>;
}

export async function loadCarrierRequestContractPreview(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<Database> | any,
  requestId: string,
  opts: { hideCommission?: boolean; carrierExtIdScope?: string | null } = {},
): Promise<ContractPreviewResult | { ok: false; status: number; error: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = client as any;
  let q = c
    .from("dispatcher_carrier_requests")
    .select(
      "id, dispatcher_carrier_ext_id, dispatcher_driver_ext_id, dispatcher_vehicle_ext_id, dispatcher_deal_id, " +
        "request_number, cargo_name, loading_city, loading_address, loading_date, " +
        "unloading_city, unloading_address, unloading_date, " +
        "customer_name, " +
        "rate_amount, rate_currency, payment_type, payment_delay_days, " +
        "commission_percent, commission_amount, terms_text, dispatcher_comment, " +
        "request_status, sent_at, responded_at, responded_by, created_at",
    )
    .eq("id", requestId);
  if (opts.carrierExtIdScope) {
    q = q.eq("dispatcher_carrier_ext_id", opts.carrierExtIdScope);
  }
  const { data: req, error } = await q.maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  if (!req) return { ok: false, status: 404, error: "not_found" };
  const r = req as Record<string, unknown>;

  const carrierExtId = r.dispatcher_carrier_ext_id as string | null;
  const driverExtId = r.dispatcher_driver_ext_id as string | null;
  const vehicleExtId = r.dispatcher_vehicle_ext_id as string | null;

  const [carrierRes, driverRes, vehicleRes] = await Promise.all([
    carrierExtId
      ? c
          .from("dispatcher_carrier_ext")
          .select("name, inn, ogrn, tax_regime, phone, email, ati_id")
          .eq("id", carrierExtId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    driverExtId
      ? c
          .from("dispatcher_driver_ext")
          .select("full_name, phone")
          .eq("id", driverExtId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    vehicleExtId
      ? c
          .from("dispatcher_vehicle_ext")
          .select(
            "vehicle_kind, body_type, payload_kg, volume_m3, vehicle_id",
          )
          .eq("id", vehicleExtId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Госномер: dispatcher_vehicle_ext не хранит plate. Пытаемся подтянуть из vehicles.
  let vehiclePlate: string | null = null;
  const vehicleProd =
    (vehicleRes?.data as { vehicle_id?: string | null } | null)?.vehicle_id ??
    null;
  if (vehicleProd) {
    const { data: vrow } = await c
      .from("vehicles")
      .select("license_plate, plate, gov_number")
      .eq("id", vehicleProd)
      .maybeSingle();
    if (vrow) {
      const v = vrow as Record<string, unknown>;
      vehiclePlate =
        (v.license_plate as string | null) ??
        (v.plate as string | null) ??
        (v.gov_number as string | null) ??
        null;
    }
  }

  const carrier = (carrierRes?.data ?? null) as Record<string, unknown> | null;
  const driver = (driverRes?.data ?? null) as Record<string, unknown> | null;
  const vehicle = (vehicleRes?.data ?? null) as Record<string, unknown> | null;

  const payload: CarrierRequestContractPayload = {
    request_number: (r.request_number as string | null) ?? null,
    request_created_at: (r.created_at as string | null) ?? null,
    cargo_name: (r.cargo_name as string | null) ?? null,
    loading_city: (r.loading_city as string | null) ?? null,
    loading_address: (r.loading_address as string | null) ?? null,
    loading_date: (r.loading_date as string | null) ?? null,
    unloading_city: (r.unloading_city as string | null) ?? null,
    unloading_address: (r.unloading_address as string | null) ?? null,
    unloading_date: (r.unloading_date as string | null) ?? null,
    rate_amount: (r.rate_amount as number | null) ?? null,
    rate_currency: (r.rate_currency as string | null) ?? "RUB",
    payment_type: (r.payment_type as string | null) ?? null,
    payment_delay_days: (r.payment_delay_days as number | null) ?? null,
    commission_percent: (r.commission_percent as number | null) ?? null,
    commission_amount: (r.commission_amount as number | null) ?? null,
    customer_name: (r.customer_name as string | null) ?? null,
    dispatcher_comment: (r.dispatcher_comment as string | null) ?? null,
    terms_text: (r.terms_text as string | null) ?? null,
    request_status: (r.request_status as string | null) ?? null,
    carrier_name: (carrier?.name as string | null) ?? null,
    carrier_inn: (carrier?.inn as string | null) ?? null,
    carrier_ogrn: (carrier?.ogrn as string | null) ?? null,
    carrier_tax_regime: (carrier?.tax_regime as string | null) ?? null,
    carrier_phone: (carrier?.phone as string | null) ?? null,
    carrier_email: (carrier?.email as string | null) ?? null,
    carrier_ati: (carrier?.ati_id as string | null) ?? null,
    driver_name: (driver?.full_name as string | null) ?? null,
    driver_phone: (driver?.phone as string | null) ?? null,
    vehicle_plate: vehiclePlate,
    vehicle_kind: (vehicle?.vehicle_kind as string | null) ?? null,
    vehicle_body_type: (vehicle?.body_type as string | null) ?? null,
    vehicle_payload_kg: (vehicle?.payload_kg as number | null) ?? null,
    vehicle_volume_m3: (vehicle?.volume_m3 as number | null) ?? null,
    vehicle_name:
      [vehicle?.vehicle_kind, vehicle?.body_type]
        .filter(Boolean)
        .join(" / ") || null,
    carrier_responded_by: (r.responded_by as string | null) ?? null,
    carrier_responded_at: (r.responded_at as string | null) ?? null,
    hide_commission: opts.hideCommission ?? false,
  };

  return {
    ok: true,
    subject: carrierRequestContractSubject(payload),
    contract_text: buildCarrierRequestContractText(payload),
    request: r,
  };
}
