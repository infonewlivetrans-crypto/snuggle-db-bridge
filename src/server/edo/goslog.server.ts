// Ручная фиксация статуса экспедитора в ГосЛог. Без live-проверки.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GoslogStatus } from "@/lib/edo/scenarios";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

export interface GoslogRow {
  id: string;
  forwarder_id: string | null;
  inn: string | null;
  ogrn: string | null;
  company_name: string | null;
  okved_codes: string[];
  has_okved_5229: boolean;
  goslog_status: GoslogStatus;
  registry_number: string | null;
  application_number: string | null;
  application_date: string | null;
  included_at: string | null;
  source_url: string | null;
  verified_by: string | null;
  verified_at: string | null;
  verification_comment: string | null;
  updated_at: string;
}

export type GoslogPatch = Partial<Omit<GoslogRow, "updated_at">>;

export async function listGoslog(client: AnyClient): Promise<GoslogRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client.from("forwarder_goslog_status") as any)
    .select("*").order("updated_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as GoslogRow[];
}

export async function getGoslogByForwarder(
  client: AnyClient, forwarderId: string,
): Promise<GoslogRow | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client.from("forwarder_goslog_status") as any)
    .select("*").eq("forwarder_id", forwarderId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as GoslogRow | null) ?? null;
}

export async function upsertGoslog(
  client: AnyClient, userId: string, patch: GoslogPatch,
): Promise<GoslogRow> {
  const row = {
    ...patch,
    verified_by: userId,
    verified_at: new Date().toISOString(),
  };
  if (patch.id || (patch as { id?: string }).id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (client.from("forwarder_goslog_status") as any)
      .update(row).eq("id", (patch as { id: string }).id).select("*").single();
    if (error) throw new Error(error.message);
    return data as GoslogRow;
  }
  if (patch.forwarder_id) {
    const ex = await getGoslogByForwarder(client, patch.forwarder_id);
    if (ex) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (client.from("forwarder_goslog_status") as any)
        .update(row).eq("id", ex.id).select("*").single();
      if (error) throw new Error(error.message);
      return data as GoslogRow;
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client.from("forwarder_goslog_status") as any)
    .insert(row).select("*").single();
  if (error) throw new Error(error.message);
  return data as GoslogRow;
}
