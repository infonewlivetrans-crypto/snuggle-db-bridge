// Серверный слой для изменений по рейсу (дополнительные титулы ЭПД).
// Mock: ничего реального в Saby не отправляем.
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

export const CHANGE_TYPES = [
  "driver_change",
  "vehicle_change",
  "trailer_change",
  "unload_point_change",
  "redirect",
  "rate_change",
  "payment_terms_change",
  "load_datetime_change",
  "unload_datetime_change",
  "trip_cancel",
  "order_recall",
  "other",
] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

export const CHANGE_TYPE_LABEL: Record<ChangeType, string> = {
  driver_change: "Смена водителя",
  vehicle_change: "Смена транспортного средства",
  trailer_change: "Смена прицепа",
  unload_point_change: "Изменение точки выгрузки",
  redirect: "Переадресация",
  rate_change: "Изменение стоимости перевозки",
  payment_terms_change: "Изменение условий оплаты",
  load_datetime_change: "Изменение даты/времени погрузки",
  unload_datetime_change: "Изменение даты/времени выгрузки",
  trip_cancel: "Отмена рейса",
  order_recall: "Отзыв поручения",
  other: "Другое",
};

export const CHANGE_STATUSES = [
  "draft",
  "requested",
  "approved",
  "rejected",
  "sent_to_operator_mock",
  "completed_mock",
  "failed_mock",
] as const;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];

export const CHANGE_STATUS_LABEL: Record<ChangeStatus, string> = {
  draft: "Черновик",
  requested: "Запрошено",
  approved: "Согласовано",
  rejected: "Отклонено",
  sent_to_operator_mock: "Отправлено оператору (mock)",
  completed_mock: "Выполнено (mock)",
  failed_mock: "Ошибка (mock)",
};

export interface ChangeRow {
  id: string;
  document_id: string;
  carrier_ext_id: string;
  change_type: ChangeType;
  old_value_json: unknown;
  new_value_json: unknown;
  reason: string | null;
  requested_by: string | null;
  requested_by_role: string | null;
  status: ChangeStatus;
  approved_by: string | null;
  approved_at: string | null;
  operator_status: string | null;
  saby_action_hint: string | null;
  is_training: boolean;
  created_at: string;
  updated_at: string;
}

export async function listChanges(
  client: AnyClient,
  documentId: string,
): Promise<ChangeRow[]> {
  const { data, error } = await client
    .from("edo_document_changes")
    .select("*")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ChangeRow[];
}

export async function createChange(
  client: AnyClient,
  carrierExtId: string,
  documentId: string,
  userId: string | null,
  body: Partial<ChangeRow>,
): Promise<ChangeRow> {
  const insert = {
    document_id: documentId,
    carrier_ext_id: carrierExtId,
    change_type: body.change_type ?? "other",
    old_value_json: body.old_value_json ?? {},
    new_value_json: body.new_value_json ?? {},
    reason: body.reason ?? null,
    requested_by: userId,
    requested_by_role: body.requested_by_role ?? null,
    status: (body.status ?? "draft") as ChangeStatus,
    saby_action_hint: body.saby_action_hint ?? null,
    is_training: Boolean(body.is_training),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client.from("edo_document_changes") as any)
    .insert(insert)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as ChangeRow;
}

export async function patchChange(
  client: AnyClient,
  documentId: string,
  changeId: string,
  userId: string | null,
  patch: Partial<ChangeRow>,
): Promise<void> {
  const upd: Record<string, unknown> = {};
  for (const k of [
    "change_type",
    "old_value_json",
    "new_value_json",
    "reason",
    "status",
    "operator_status",
    "saby_action_hint",
  ] as const) {
    if (k in patch) upd[k] = patch[k] ?? null;
  }
  if (patch.status === "approved") {
    upd.approved_by = userId;
    upd.approved_at = new Date().toISOString();
  }
  if (patch.status === "sent_to_operator_mock") {
    upd.operator_status = "queued_mock";
  }
  if (patch.status === "completed_mock") {
    upd.operator_status = "completed_mock";
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (client.from("edo_document_changes") as any)
    .update(upd)
    .eq("id", changeId)
    .eq("document_id", documentId);
  if (error) throw new Error(error.message);
}

export async function countChanges(
  client: AnyClient,
  documentId: string,
): Promise<number> {
  const { count, error } = await client
    .from("edo_document_changes")
    .select("id", { count: "exact", head: true })
    .eq("document_id", documentId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
