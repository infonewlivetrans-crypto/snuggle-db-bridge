// Сервер: сравнение snapshot экспедитора в ЭПД-документе с актуальными данными.
// Без service_role, всё через user-client + RLS / SECURITY DEFINER RPC.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ForwarderSnapshot, ForwarderPublicCard } from "@/lib/edo/forwarder-snapshot";
import { buildForwarderSnapshot, isGoslogConfirmed } from "@/lib/edo/forwarder-snapshot";
import { getForwarderForCarrier } from "@/server/edo/forwarders-public.server";
import type { ForwarderPossessionMode } from "@/lib/edo/scenarios";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

export type SnapshotDiffType =
  | "no_diff"
  | "goslog_status_changed"
  | "goslog_registry_number_changed"
  | "goslog_check_date_changed"
  | "okved_5229_changed"
  | "okved_codes_changed"
  | "requisites_changed"
  | "contact_changed"
  | "possession_mode_changed"
  | "forwarder_status_changed"
  | "current_forwarder_not_found"
  | "snapshot_missing"
  | "manual_review_required";

export type SnapshotRiskLevel = "info" | "warning" | "critical";

export interface SnapshotFieldDiff {
  field: string;
  label: string;
  snapshot_value: unknown;
  current_value: unknown;
  diff_type: SnapshotDiffType;
  risk: SnapshotRiskLevel;
}

export interface SnapshotDiffResult {
  document_id: string;
  forwarder_id: string | null;
  has_snapshot: boolean;
  snapshot: ForwarderSnapshot | null;
  current_snapshot: ForwarderSnapshot | null;
  current_forwarder_status: string | null;
  diffs: SnapshotFieldDiff[];
  diff_types: SnapshotDiffType[];
  risk_level: SnapshotRiskLevel;
  checked_at: string;
}

export interface SnapshotReviewRow {
  id: string;
  document_id: string;
  forwarder_id: string | null;
  checked_by: string | null;
  checked_at: string;
  audience: "shared" | "dispatcher_internal";
  decision: string;
  comment: string | null;
  diff_snapshot_json: Record<string, unknown> | null;
  created_at: string;
}

// --- helpers ---------------------------------------------------------------

function pickForwarderSnapshotFromAny(
  src: unknown,
): ForwarderSnapshot | null {
  if (!src || typeof src !== "object") return null;
  const o = src as Record<string, unknown>;
  if (o.forwarder && typeof o.forwarder === "object") {
    return pickForwarderSnapshotFromAny(o.forwarder);
  }
  if (typeof o.forwarder_id !== "string") return null;
  return o as unknown as ForwarderSnapshot;
}

export async function getDocumentForwarderSnapshot(
  client: AnyClient, documentId: string,
): Promise<{ snapshot: ForwarderSnapshot | null; doc: Record<string, unknown> | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client.from("carrier_edo_documents") as any)
    .select("id, scenario_id, epd_context_snapshot, payload_json")
    .eq("id", documentId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { snapshot: null, doc: null };
  const ctx = data.epd_context_snapshot as Record<string, unknown> | null;
  const payload = data.payload_json as Record<string, unknown> | null;
  const fromCtx = pickForwarderSnapshotFromAny(ctx);
  if (fromCtx) return { snapshot: fromCtx, doc: data };
  const epdCtx = payload?.epd_context as Record<string, unknown> | undefined;
  const fromPayload = pickForwarderSnapshotFromAny(epdCtx);
  if (fromPayload) return { snapshot: fromPayload, doc: data };
  // последний fallback — сценарий
  if (data.scenario_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: s } = await (client.from("edo_scenarios") as any)
      .select("participants_json").eq("id", data.scenario_id as string).maybeSingle();
    const snap = pickForwarderSnapshotFromAny(
      ((s?.participants_json as Record<string, unknown> | null) ?? {}).forwarder_snapshot,
    );
    if (snap) return { snapshot: snap, doc: data };
  }
  return { snapshot: null, doc: data };
}

export async function getCurrentForwarderState(
  client: AnyClient, forwarderId: string,
  possessionMode: ForwarderPossessionMode | null = null,
): Promise<{ card: ForwarderPublicCard | null; snapshot: ForwarderSnapshot | null }> {
  const card = await getForwarderForCarrier(client, forwarderId);
  if (!card) return { card: null, snapshot: null };
  return { card, snapshot: buildForwarderSnapshot(card, possessionMode) };
}

function eqLoose(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    const sa = [...a].map(String).sort().join("|");
    const sb = [...b].map(String).sort().join("|");
    return sa === sb;
  }
  return (a ?? null) === (b ?? null);
}

const FIELD_LABELS: Record<string, string> = {
  forwarder_name: "Название",
  forwarder_inn: "ИНН",
  forwarder_ogrn: "ОГРН",
  forwarder_legal_form: "Орг-правовая форма",
  forwarder_phone: "Телефон",
  forwarder_email: "Email",
  forwarder_possession_mode: "Режим участия",
  has_okved_5229: "ОКВЭД 52.29",
  okved_codes: "Коды ОКВЭД",
  goslog_status: "Статус ГосЛог",
  goslog_registry_number: "Номер реестра ГосЛог",
  goslog_application_number: "Номер заявки ГосЛог",
  goslog_checked_at: "Дата проверки ГосЛог",
  goslog_source_url: "Источник ГосЛог",
};

function riskFor(
  field: string, snap: ForwarderSnapshot, cur: ForwarderSnapshot,
): { type: SnapshotDiffType; risk: SnapshotRiskLevel } {
  switch (field) {
    case "forwarder_phone":
    case "forwarder_email":
      return { type: "contact_changed", risk: "info" };
    case "has_okved_5229":
    case "okved_codes":
      return { type: field === "has_okved_5229" ? "okved_5229_changed" : "okved_codes_changed", risk: "warning" };
    case "goslog_status": {
      const wasOk = isGoslogConfirmed(snap.goslog_status);
      const isCritNow = cur.goslog_status === "not_found"
        || cur.goslog_status === "rejected"
        || cur.goslog_status === "error"
        || cur.goslog_status === "expired_or_risk";
      return { type: "goslog_status_changed", risk: wasOk && isCritNow ? "critical" : "warning" };
    }
    case "goslog_registry_number":
      return { type: "goslog_registry_number_changed", risk: "warning" };
    case "goslog_checked_at":
    case "goslog_source_url":
    case "goslog_application_number":
      return { type: "goslog_check_date_changed", risk: "info" };
    case "forwarder_possession_mode":
      return { type: "possession_mode_changed", risk: "warning" };
    case "forwarder_name":
    case "forwarder_inn":
    case "forwarder_ogrn":
    case "forwarder_legal_form":
      return { type: "requisites_changed", risk: "warning" };
    default:
      return { type: "manual_review_required", risk: "info" };
  }
}

const COMPARE_FIELDS: Array<keyof ForwarderSnapshot> = [
  "forwarder_name", "forwarder_inn", "forwarder_ogrn", "forwarder_legal_form",
  "forwarder_phone", "forwarder_email", "forwarder_possession_mode",
  "has_okved_5229", "okved_codes",
  "goslog_status", "goslog_registry_number", "goslog_application_number",
  "goslog_checked_at", "goslog_source_url",
];

export function compareForwarderSnapshot(
  snapshot: ForwarderSnapshot | null,
  current: ForwarderSnapshot | null,
  currentStatus: string | null = null,
): Omit<SnapshotDiffResult, "document_id" | "forwarder_id" | "checked_at" | "has_snapshot"> {
  if (!snapshot && !current) {
    return {
      snapshot: null, current_snapshot: null, current_forwarder_status: currentStatus,
      diffs: [{
        field: "snapshot", label: "Snapshot",
        snapshot_value: null, current_value: null,
        diff_type: "snapshot_missing", risk: "warning",
      }],
      diff_types: ["snapshot_missing"],
      risk_level: "warning",
    };
  }
  if (snapshot && !current) {
    return {
      snapshot, current_snapshot: null, current_forwarder_status: currentStatus,
      diffs: [{
        field: "forwarder", label: "Экспедитор",
        snapshot_value: snapshot.forwarder_id, current_value: null,
        diff_type: "current_forwarder_not_found", risk: "critical",
      }],
      diff_types: ["current_forwarder_not_found"],
      risk_level: "critical",
    };
  }
  if (!snapshot && current) {
    return {
      snapshot: null, current_snapshot: current, current_forwarder_status: currentStatus,
      diffs: [{
        field: "snapshot", label: "Snapshot",
        snapshot_value: null, current_value: current.forwarder_id,
        diff_type: "snapshot_missing", risk: "warning",
      }],
      diff_types: ["snapshot_missing"],
      risk_level: "warning",
    };
  }
  const snap = snapshot!;
  const cur = current!;
  const diffs: SnapshotFieldDiff[] = [];
  const types = new Set<SnapshotDiffType>();
  for (const f of COMPARE_FIELDS) {
    const a = snap[f];
    const b = cur[f];
    if (!eqLoose(a, b)) {
      const r = riskFor(f as string, snap, cur);
      diffs.push({
        field: f as string,
        label: FIELD_LABELS[f as string] ?? (f as string),
        snapshot_value: a ?? null,
        current_value: b ?? null,
        diff_type: r.type,
        risk: r.risk,
      });
      types.add(r.type);
    }
  }
  // Изменение статуса экспедитора в справочнике (если знаем).
  if (currentStatus && currentStatus === "archive") {
    diffs.push({
      field: "forwarder_status", label: "Статус в справочнике",
      snapshot_value: null, current_value: currentStatus,
      diff_type: "forwarder_status_changed", risk: "critical",
    });
    types.add("forwarder_status_changed");
  }
  let risk: SnapshotRiskLevel = "info";
  for (const d of diffs) {
    if (d.risk === "critical") { risk = "critical"; break; }
    if (d.risk === "warning") risk = "warning";
  }
  if (diffs.length === 0) {
    return {
      snapshot: snap, current_snapshot: cur, current_forwarder_status: currentStatus,
      diffs: [], diff_types: ["no_diff"], risk_level: "info",
    };
  }
  return {
    snapshot: snap, current_snapshot: cur, current_forwarder_status: currentStatus,
    diffs, diff_types: Array.from(types), risk_level: risk,
  };
}

export async function getDocumentSnapshotDiff(
  client: AnyClient, documentId: string,
): Promise<SnapshotDiffResult> {
  const { snapshot } = await getDocumentForwarderSnapshot(client, documentId);
  const fwdId = snapshot?.forwarder_id ?? null;
  let curSnap: ForwarderSnapshot | null = null;
  let curStatus: string | null = null;
  if (fwdId) {
    const r = await getCurrentForwarderState(
      client, fwdId, snapshot?.forwarder_possession_mode ?? null,
    );
    curSnap = r.snapshot;
    curStatus = r.card?.forwarder.status ?? null;
  }
  const cmp = compareForwarderSnapshot(snapshot, curSnap, curStatus);
  return {
    document_id: documentId,
    forwarder_id: fwdId,
    has_snapshot: Boolean(snapshot),
    checked_at: new Date().toISOString(),
    ...cmp,
  };
}

export function summariseSnapshotDiff(d: SnapshotDiffResult): {
  level: SnapshotRiskLevel;
  text: string;
} {
  if (!d.has_snapshot) {
    return { level: "warning", text: "В документе нет snapshot экспедитора." };
  }
  if (d.diff_types.includes("no_diff")) {
    return { level: "info", text: "Данные совпадают со snapshot." };
  }
  if (d.risk_level === "critical") {
    return { level: "critical", text: "Критическое отличие — требуется проверка перед отправкой." };
  }
  return { level: d.risk_level, text: `Есть отличия (${d.diffs.length}).` };
}

// --- список документов с diff по экспедитору (для диспетчера) ---------------

export interface DocumentDiffSummary {
  document_id: string;
  scenario_id: string | null;
  scenario_type: string | null;
  document_status: string | null;
  document_title: string | null;
  is_training: boolean;
  trip_id: string | null;
  created_at: string;
  snapshot_goslog: string | null;
  current_goslog: string | null;
  snapshot_okved_5229: boolean | null;
  current_okved_5229: boolean | null;
  diff_types: SnapshotDiffType[];
  risk_level: SnapshotRiskLevel;
  has_diff: boolean;
  has_snapshot: boolean;
}

export async function listDocumentsWithForwarderSnapshotDiff(
  client: AnyClient, forwarderId: string,
): Promise<DocumentDiffSummary[]> {
  // 1. Сценарии этого экспедитора.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: scenarios } = await (client.from("edo_scenarios") as any)
    .select("id, scenario_type, is_training, trip_id, participants_json, created_at")
    .eq("forwarder_id", forwarderId)
    .order("created_at", { ascending: false }).limit(200);
  const sRows = (scenarios ?? []) as Array<Record<string, unknown>>;
  const sIds = sRows.map(s => s.id as string);
  if (sIds.length === 0) return [];
  // 2. Документы по сценариям.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: docs } = await (client.from("carrier_edo_documents") as any)
    .select("id, scenario_id, status, title, created_at, epd_context_snapshot, payload_json")
    .in("scenario_id", sIds);
  const docRows = (docs ?? []) as Array<Record<string, unknown>>;
  if (docRows.length === 0) return [];
  // 3. Текущее состояние экспедитора (один раз).
  const { card } = await getCurrentForwarderState(client, forwarderId);
  const sById = new Map<string, Record<string, unknown>>();
  for (const s of sRows) sById.set(s.id as string, s);
  const out: DocumentDiffSummary[] = [];
  for (const d of docRows) {
    const snap = pickForwarderSnapshotFromAny(d.epd_context_snapshot)
      ?? pickForwarderSnapshotFromAny(
        (d.payload_json as Record<string, unknown> | null)?.epd_context,
      );
    const curSnap = card ? buildForwarderSnapshot(card, snap?.forwarder_possession_mode ?? null) : null;
    const cmp = compareForwarderSnapshot(snap, curSnap, card?.forwarder.status ?? null);
    const hasDiff = !cmp.diff_types.includes("no_diff");
    const s = sById.get((d.scenario_id as string) ?? "");
    out.push({
      document_id: d.id as string,
      scenario_id: (d.scenario_id as string | null) ?? null,
      scenario_type: (s?.scenario_type as string | null) ?? null,
      document_status: (d.status as string | null) ?? null,
      document_title: (d.title as string | null) ?? null,
      is_training: Boolean(s?.is_training),
      trip_id: (s?.trip_id as string | null) ?? null,
      created_at: (d.created_at as string) ?? "",
      snapshot_goslog: snap?.goslog_status ?? null,
      current_goslog: curSnap?.goslog_status ?? null,
      snapshot_okved_5229: snap ? snap.has_okved_5229 : null,
      current_okved_5229: curSnap ? curSnap.has_okved_5229 : null,
      diff_types: cmp.diff_types,
      risk_level: cmp.risk_level,
      has_diff: hasDiff,
      has_snapshot: Boolean(snap),
    });
  }
  return out;
}

// --- ручные отметки проверки -----------------------------------------------

export async function listSnapshotReviews(
  client: AnyClient, documentId: string, audience?: "shared" | "dispatcher_internal" | "all",
): Promise<SnapshotReviewRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (client.from("edo_snapshot_reviews") as any)
    .select("*").eq("document_id", documentId)
    .order("created_at", { ascending: false });
  if (audience && audience !== "all") q = q.eq("audience", audience);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as SnapshotReviewRow[];
}

export interface CreateSnapshotReviewInput {
  decision: SnapshotReviewRow["decision"];
  comment?: string | null;
  audience?: "shared" | "dispatcher_internal";
  diff_snapshot_json?: Record<string, unknown> | null;
}

export async function createSnapshotReview(
  client: AnyClient, userId: string,
  documentId: string, forwarderId: string | null,
  input: CreateSnapshotReviewInput,
): Promise<SnapshotReviewRow> {
  const row = {
    document_id: documentId,
    forwarder_id: forwarderId,
    checked_by: userId,
    audience: input.audience ?? "shared",
    decision: input.decision,
    comment: input.comment ?? null,
    diff_snapshot_json: input.diff_snapshot_json ?? null,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client.from("edo_snapshot_reviews") as any)
    .insert(row).select("*").single();
  if (error) throw new Error(error.message);
  return data as SnapshotReviewRow;
}
