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
