// Mock-QR для водителя по документу. Реальный ГИС ЭПД здесь не используется.
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

export interface QrRow {
  id: string;
  document_id: string;
  carrier_ext_id: string;
  trip_id: string | null;
  driver_id: string | null;
  qr_uid: string;
  qr_payload: unknown;
  qr_status: string;
  qr_generated_at: string;
  qr_cached_at: string | null;
  qr_offline_available: boolean;
  last_opened_by_driver_at: string | null;
  is_mock: boolean;
  created_at: string;
  updated_at: string;
}

function newUid(): string {
  const r = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `MOCK-${Date.now().toString(36).toUpperCase()}-${r}`;
}

export async function getQrForDocument(
  client: AnyClient,
  documentId: string,
): Promise<QrRow | null> {
  const { data, error } = await client
    .from("edo_document_qr_mock")
    .select("*")
    .eq("document_id", documentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as QrRow | null) ?? null;
}

export async function listQrForDriver(
  client: AnyClient,
  driverId: string,
): Promise<QrRow[]> {
  const { data, error } = await client
    .from("edo_document_qr_mock")
    .select("*")
    .eq("driver_id", driverId)
    .order("qr_generated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as QrRow[];
}

export async function ensureQrForDocument(
  client: AnyClient,
  carrierExtId: string,
  documentId: string,
  opts: { trip_id?: string | null; driver_id?: string | null },
): Promise<QrRow> {
  const existing = await getQrForDocument(client, documentId);
  if (existing) {
    if (opts.driver_id && existing.driver_id !== opts.driver_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (client.from("edo_document_qr_mock") as any)
        .update({ driver_id: opts.driver_id, trip_id: opts.trip_id ?? existing.trip_id })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { ...existing, driver_id: opts.driver_id, trip_id: opts.trip_id ?? existing.trip_id };
    }
    return existing;
  }
  const uid = newUid();
  const payload = {
    uid,
    document_id: documentId,
    issued_at: new Date().toISOString(),
    source: "mock",
    note: "Тестовый QR без подключения к ГИС ЭПД",
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client.from("edo_document_qr_mock") as any)
    .insert({
      document_id: documentId,
      carrier_ext_id: carrierExtId,
      trip_id: opts.trip_id ?? null,
      driver_id: opts.driver_id ?? null,
      qr_uid: uid,
      qr_payload: payload,
      qr_status: "mock",
      qr_offline_available: true,
      is_mock: true,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as QrRow;
}

export async function markQrOpened(
  client: AnyClient,
  documentId: string,
): Promise<void> {
  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (client.from("edo_document_qr_mock") as any)
    .update({ last_opened_by_driver_at: now, qr_cached_at: now })
    .eq("document_id", documentId);
  if (error) throw new Error(error.message);
}
