// Серверный слой для замечаний при приёмке груза (Т2).
// Работает через user-client + RLS. Без service_role.
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

export {
  REMARK_TYPES,
  REMARK_TYPE_LABEL,
  type RemarkType,
  type RemarkSeverity,
} from "@/lib/edo/remarks-shared";
import type { RemarkType, RemarkSeverity } from "@/lib/edo/remarks-shared";

export interface RemarkRow {
  id: string;
  document_id: string;
  carrier_ext_id: string;
  remark_type: RemarkType;
  remark_text: string | null;
  severity: RemarkSeverity;
  quantity_expected: number | null;
  quantity_actual: number | null;
  weight_expected: number | null;
  weight_actual: number | null;
  attachments_json: unknown;
  created_by: string | null;
  created_by_role: string | null;
  is_training: boolean;
  created_at: string;
  updated_at: string;
}

export async function listRemarks(
  client: AnyClient,
  documentId: string,
): Promise<RemarkRow[]> {
  const { data, error } = await client
    .from("edo_document_remarks")
    .select("*")
    .eq("document_id", documentId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as RemarkRow[];
}

export async function createRemark(
  client: AnyClient,
  carrierExtId: string,
  documentId: string,
  userId: string | null,
  body: Partial<RemarkRow>,
): Promise<RemarkRow> {
  const insert = {
    document_id: documentId,
    carrier_ext_id: carrierExtId,
    remark_type: body.remark_type ?? "other",
    remark_text: body.remark_text ?? null,
    severity: (body.severity ?? "info") as RemarkSeverity,
    quantity_expected: body.quantity_expected ?? null,
    quantity_actual: body.quantity_actual ?? null,
    weight_expected: body.weight_expected ?? null,
    weight_actual: body.weight_actual ?? null,
    attachments_json: body.attachments_json ?? [],
    created_by: userId,
    created_by_role: body.created_by_role ?? null,
    is_training: Boolean(body.is_training),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client.from("edo_document_remarks") as any)
    .insert(insert)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as RemarkRow;
}

export async function updateRemark(
  client: AnyClient,
  documentId: string,
  remarkId: string,
  patch: Partial<RemarkRow>,
): Promise<void> {
  const upd: Record<string, unknown> = {};
  for (const k of [
    "remark_type",
    "remark_text",
    "severity",
    "quantity_expected",
    "quantity_actual",
    "weight_expected",
    "weight_actual",
    "attachments_json",
  ] as const) {
    if (k in patch) upd[k] = patch[k] ?? null;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (client.from("edo_document_remarks") as any)
    .update(upd)
    .eq("id", remarkId)
    .eq("document_id", documentId);
  if (error) throw new Error(error.message);
}

export async function deleteRemark(
  client: AnyClient,
  documentId: string,
  remarkId: string,
): Promise<void> {
  const { error } = await client
    .from("edo_document_remarks")
    .delete()
    .eq("id", remarkId)
    .eq("document_id", documentId);
  if (error) throw new Error(error.message);
}

export async function summariseRemarks(
  client: AnyClient,
  documentId: string,
): Promise<{ total: number; critical: number }> {
  const { data, error } = await client
    .from("edo_document_remarks")
    .select("severity")
    .eq("document_id", documentId);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ severity: RemarkSeverity }>;
  return {
    total: rows.length,
    critical: rows.filter(r => r.severity === "critical").length,
  };
}
