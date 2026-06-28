// Безопасные запросы по экспедиторам для carrier-контекста.
// Используют security-definer RPC и не отдают внутренние комментарии диспетчера.
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ForwarderPublicRow, ForwarderPublicCard, ForwarderGoslogPublicRow,
  ForwarderSnapshot,
} from "@/lib/edo/forwarder-snapshot";
import type { ForwarderPossessionMode } from "@/lib/edo/scenarios";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

function normalizeOkved(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  return [];
}

export async function searchForwardersForCarrier(
  client: AnyClient, query: string,
): Promise<ForwarderPublicRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client.rpc as any)(
    "search_forwarders_for_carrier", { p_query: query ?? "" },
  );
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
    id: r.id as string,
    company_name: (r.company_name as string) ?? "",
    inn: (r.inn as string | null) ?? null,
    ogrn: (r.ogrn as string | null) ?? null,
    legal_form: (r.legal_form as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    contact_person: (r.contact_person as string | null) ?? null,
    city: (r.city as string | null) ?? null,
    okved_codes: normalizeOkved(r.okved_codes),
    has_okved_5229: Boolean(r.has_okved_5229),
    status: (r.status as string) ?? "new",
  }));
}

export async function getForwarderForCarrier(
  client: AnyClient, id: string,
): Promise<ForwarderPublicCard | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client.rpc as any)(
    "get_forwarder_for_carrier", { p_id: id },
  );
  if (error) throw new Error(error.message);
  if (!data) return null;
  const payload = data as { forwarder?: Record<string, unknown>; goslog?: Record<string, unknown> | null };
  const f = payload.forwarder ?? {};
  const g = payload.goslog ?? null;
  return {
    forwarder: {
      id: f.id as string,
      company_name: (f.company_name as string) ?? "",
      inn: (f.inn as string | null) ?? null,
      ogrn: (f.ogrn as string | null) ?? null,
      legal_form: (f.legal_form as string | null) ?? null,
      phone: (f.phone as string | null) ?? null,
      email: (f.email as string | null) ?? null,
      contact_person: (f.contact_person as string | null) ?? null,
      city: (f.city as string | null) ?? null,
      okved_codes: normalizeOkved(f.okved_codes),
      has_okved_5229: Boolean(f.has_okved_5229),
      status: (f.status as string) ?? "new",
    },
    goslog: g ? {
      goslog_status: (g.goslog_status as string) ?? "unknown",
      registry_number: (g.registry_number as string | null) ?? null,
      application_number: (g.application_number as string | null) ?? null,
      application_date: (g.application_date as string | null) ?? null,
      included_at: (g.included_at as string | null) ?? null,
      source_url: (g.source_url as string | null) ?? null,
      verified_at: (g.verified_at as string | null) ?? null,
      verification_comment: (g.verification_comment as string | null) ?? null,
      has_okved_5229: g.has_okved_5229 === undefined ? undefined : Boolean(g.has_okved_5229),
      okved_codes: g.okved_codes === undefined ? undefined : normalizeOkved(g.okved_codes),
    } as ForwarderGoslogPublicRow : null,
  };
}

export function buildForwarderSnapshot(
  card: ForwarderPublicCard,
  possessionMode: ForwarderPossessionMode | null,
): ForwarderSnapshot {
  const f = card.forwarder;
  const g = card.goslog;
  return {
    forwarder_id: f.id,
    forwarder_source: "dispatcher_forwarder_ext",
    forwarder_name: f.company_name,
    forwarder_inn: f.inn,
    forwarder_ogrn: f.ogrn,
    forwarder_legal_form: f.legal_form,
    forwarder_phone: f.phone,
    forwarder_email: f.email,
    forwarder_possession_mode: possessionMode,
    has_okved_5229: f.has_okved_5229,
    okved_codes: f.okved_codes,
    goslog_status: g?.goslog_status ?? null,
    goslog_registry_number: g?.registry_number ?? null,
    goslog_application_number: g?.application_number ?? null,
    goslog_checked_at: g?.verified_at ?? g?.included_at ?? null,
    goslog_source_url: g?.source_url ?? null,
    snapshot_created_at: new Date().toISOString(),
  };
}
