// Серверная логика справочника экспедиторов диспетчера.
// RLS требует роль admin или dispatcher. Удаление — soft (archived_at + status='archive').
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type ForwarderExtStatus =
  | "new" | "on_check" | "ready_to_work" | "missing_docs" | "blocked" | "archive";

export const FORWARDER_EXT_STATUSES: ForwarderExtStatus[] = [
  "new", "on_check", "ready_to_work", "missing_docs", "blocked", "archive",
];

export interface ForwarderExtRow {
  id: string;
  company_name: string;
  inn: string | null;
  ogrn: string | null;
  legal_form: string | null;
  phone: string | null;
  email: string | null;
  contact_person: string | null;
  city: string | null;
  website: string | null;
  okved_codes: string[];
  has_okved_5229: boolean;
  status: ForwarderExtStatus;
  dispatcher_comment: string | null;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListForwarderExtParams {
  search?: string;
  status?: ForwarderExtStatus | "all";
  includeArchived?: boolean;
}

const ALLOWED_FIELDS = [
  "company_name", "inn", "ogrn", "legal_form", "phone", "email",
  "contact_person", "city", "website", "okved_codes", "has_okved_5229",
  "status", "dispatcher_comment",
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tbl(c: SupabaseClient<Database>): any {
  return (c as any).from("dispatcher_forwarder_ext");
}

export async function listForwarderExt(
  client: SupabaseClient<Database>,
  params: ListForwarderExtParams = {},
): Promise<ForwarderExtRow[]> {
  let q = tbl(client).select("*").order("updated_at", { ascending: false });
  if (params.search) {
    const s = params.search.trim().replace(/[%,]/g, " ");
    q = q.or(`company_name.ilike.%${s}%,inn.ilike.%${s}%`);
  }
  if (params.status && params.status !== "all") {
    q = q.eq("status", params.status);
  } else if (!params.includeArchived) {
    q = q.neq("status", "archive");
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as ForwarderExtRow[];
}

export async function getForwarderExt(
  client: SupabaseClient<Database>,
  id: string,
): Promise<ForwarderExtRow | null> {
  const { data, error } = await tbl(client).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as ForwarderExtRow | null;
}

function pickFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ALLOWED_FIELDS) {
    if (k in body) out[k] = body[k];
  }
  if ("company_name" in out && typeof out.company_name === "string") {
    out.company_name = (out.company_name as string).trim();
  }
  if ("okved_codes" in out && !Array.isArray(out.okved_codes)) {
    out.okved_codes = [];
  }
  return out;
}

export async function createForwarderExt(
  client: SupabaseClient<Database>,
  userId: string,
  body: Record<string, unknown>,
): Promise<ForwarderExtRow> {
  const payload = pickFields(body);
  if (!payload.company_name || typeof payload.company_name !== "string") {
    throw new Error("Не указано название компании");
  }
  const { data, error } = await tbl(client)
    .insert({ ...payload, created_by: userId })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as ForwarderExtRow;
}

export async function updateForwarderExt(
  client: SupabaseClient<Database>,
  id: string,
  body: Record<string, unknown>,
): Promise<ForwarderExtRow> {
  const payload = pickFields(body);
  const { data, error } = await tbl(client)
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as ForwarderExtRow;
}

export async function archiveForwarderExt(
  client: SupabaseClient<Database>,
  id: string,
): Promise<void> {
  const { error } = await tbl(client)
    .update({ status: "archive", archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export interface GoslogLinkInfo {
  linked: boolean;
  goslog_id: string | null;
  goslog_status: string | null;
  registry_number: string | null;
  application_number: string | null;
  source_url: string | null;
  verified_at: string | null;
}

async function findGoslogByLink(
  client: SupabaseClient<Database>, forwarderId: string, inn: string | null,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const direct = await (client.from("forwarder_goslog_status") as any)
    .select("*").eq("dispatcher_forwarder_ext_id", forwarderId)
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (direct.data) return direct.data as Record<string, unknown>;
  if (!inn) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byInn = await (client.from("forwarder_goslog_status") as any)
    .select("*").eq("inn", inn)
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return (byInn.data as Record<string, unknown> | null) ?? null;
}

export async function describeGoslogLink(
  client: SupabaseClient<Database>, forwarderId: string,
): Promise<GoslogLinkInfo> {
  const fw = await getForwarderExt(client, forwarderId);
  if (!fw) return {
    linked: false, goslog_id: null, goslog_status: null,
    registry_number: null, application_number: null, source_url: null, verified_at: null,
  };
  const g = await findGoslogByLink(client, forwarderId, fw.inn);
  if (!g) return {
    linked: false, goslog_id: null, goslog_status: null,
    registry_number: null, application_number: null, source_url: null, verified_at: null,
  };
  return {
    linked: (g.dispatcher_forwarder_ext_id as string | null) === forwarderId,
    goslog_id: (g.id as string) ?? null,
    goslog_status: (g.goslog_status as string) ?? null,
    registry_number: (g.registry_number as string | null) ?? null,
    application_number: (g.application_number as string | null) ?? null,
    source_url: (g.source_url as string | null) ?? null,
    verified_at: (g.verified_at as string | null) ?? null,
  };
}

export async function linkGoslogToForwarder(
  client: SupabaseClient<Database>, forwarderId: string,
): Promise<GoslogLinkInfo> {
  const fw = await getForwarderExt(client, forwarderId);
  if (!fw) throw new Error("forwarder_not_found");
  const g = await findGoslogByLink(client, forwarderId, fw.inn);
  if (!g) throw new Error("goslog_not_found");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (client.from("forwarder_goslog_status") as any)
    .update({ dispatcher_forwarder_ext_id: forwarderId })
    .eq("id", g.id as string);
  if (error) throw new Error(error.message);
  return describeGoslogLink(client, forwarderId);
}

export async function createGoslogStatusFromForwarder(
  client: SupabaseClient<Database>, userId: string, forwarderId: string,
): Promise<GoslogLinkInfo> {
  const fw = await getForwarderExt(client, forwarderId);
  if (!fw) throw new Error("forwarder_not_found");
  const ex = await findGoslogByLink(client, forwarderId, fw.inn);
  if (ex) {
    if ((ex.dispatcher_forwarder_ext_id as string | null) !== forwarderId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (client.from("forwarder_goslog_status") as any)
        .update({ dispatcher_forwarder_ext_id: forwarderId }).eq("id", ex.id as string);
    }
    return describeGoslogLink(client, forwarderId);
  }
  const row = {
    dispatcher_forwarder_ext_id: forwarderId,
    inn: fw.inn, ogrn: fw.ogrn, company_name: fw.company_name,
    okved_codes: fw.okved_codes ?? [],
    has_okved_5229: Boolean(fw.has_okved_5229),
    goslog_status: "unknown",
    verified_by: userId,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (client.from("forwarder_goslog_status") as any).insert(row);
  if (error) throw new Error(error.message);
  return describeGoslogLink(client, forwarderId);
}

export interface ForwarderEpdDocumentRow {
  scenario_id: string;
  scenario_type: string;
  forwarder_possession_mode: string | null;
  is_training: boolean;
  trip_id: string | null;
  deal_id: string | null;
  document_id: string | null;
  document_status: string | null;
  document_title: string | null;
  document_type: string | null;
  created_at: string;
  goslog_status_snapshot: string | null;
  has_snapshot: boolean;
}

export async function listForwarderEpdDocuments(
  client: SupabaseClient<Database>, forwarderId: string,
): Promise<ForwarderEpdDocumentRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: scenarios, error } = await (client.from("edo_scenarios") as any)
    .select("id, scenario_type, forwarder_possession_mode, is_training, trip_id, deal_id, participants_json, created_at")
    .eq("forwarder_id", forwarderId)
    .order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  const scenarioRows = (scenarios ?? []) as Array<Record<string, unknown>>;
  if (scenarioRows.length === 0) return [];
  const scenarioIds = scenarioRows.map(s => s.id as string);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: docs } = await (client.from("carrier_edo_documents") as any)
    .select("id, scenario_id, status, title, document_type, created_at, epd_context_snapshot")
    .in("scenario_id", scenarioIds)
    .order("created_at", { ascending: false });
  const byScenario = new Map<string, Array<Record<string, unknown>>>();
  for (const d of (docs ?? []) as Array<Record<string, unknown>>) {
    const sid = d.scenario_id as string;
    const arr = byScenario.get(sid) ?? [];
    arr.push(d);
    byScenario.set(sid, arr);
  }
  const out: ForwarderEpdDocumentRow[] = [];
  for (const s of scenarioRows) {
    const sid = s.id as string;
    const snap = ((s.participants_json as Record<string, unknown> | null) ?? {})
      .forwarder_snapshot as Record<string, unknown> | undefined;
    const goslog = (snap?.goslog_status as string | null) ?? null;
    const docList = byScenario.get(sid) ?? [];
    if (docList.length === 0) {
      out.push({
        scenario_id: sid,
        scenario_type: (s.scenario_type as string) ?? "",
        forwarder_possession_mode: (s.forwarder_possession_mode as string | null) ?? null,
        is_training: Boolean(s.is_training),
        trip_id: (s.trip_id as string | null) ?? null,
        deal_id: (s.deal_id as string | null) ?? null,
        document_id: null, document_status: null, document_title: null, document_type: null,
        created_at: (s.created_at as string) ?? "",
        goslog_status_snapshot: goslog,
        has_snapshot: Boolean(snap),
      });
    } else {
      for (const d of docList) {
        const dSnap = (d.epd_context_snapshot as Record<string, unknown> | null) ?? null;
        const dFwd = dSnap?.forwarder as Record<string, unknown> | undefined;
        out.push({
          scenario_id: sid,
          scenario_type: (s.scenario_type as string) ?? "",
          forwarder_possession_mode: (s.forwarder_possession_mode as string | null) ?? null,
          is_training: Boolean(s.is_training),
          trip_id: (s.trip_id as string | null) ?? null,
          deal_id: (s.deal_id as string | null) ?? null,
          document_id: (d.id as string) ?? null,
          document_status: (d.status as string | null) ?? null,
          document_title: (d.title as string | null) ?? null,
          document_type: (d.document_type as string | null) ?? null,
          created_at: (d.created_at as string) ?? (s.created_at as string) ?? "",
          goslog_status_snapshot: (dFwd?.goslog_status as string | null) ?? goslog,
          has_snapshot: Boolean(dSnap),
        });
      }
    }
  }
  return out;
}
