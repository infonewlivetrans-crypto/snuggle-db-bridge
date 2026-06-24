// Серверная логика ЭПД-сценариев: CRUD, валидация, создание заготовок документов.
// Работает через user-client (RLS). Без service_role.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EPD_SCENARIO_CATALOG,
  getScenarioDef,
  type EpdScenarioType,
  type ForwarderPossessionMode,
  type CargoHolderRole,
  type EpdReadinessStatus,
} from "@/lib/edo/scenarios";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

export interface ScenarioRow {
  id: string;
  carrier_ext_id: string;
  trip_id: string | null;
  deal_id: string | null;
  document_id: string | null;
  scenario_type: EpdScenarioType;
  forwarder_id: string | null;
  forwarder_possession_mode: ForwarderPossessionMode | null;
  cargo_holder_role: CargoHolderRole | null;
  required_documents: string[];
  participants_json: Record<string, unknown>;
  signing_plan_json: Record<string, unknown>;
  readiness_status: EpdReadinessStatus;
  validation_errors: string[];
  validation_warnings: string[];
  is_training: boolean;
  created_at: string;
  updated_at: string;
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
  readiness: EpdReadinessStatus;
}

export interface CreateScenarioInput {
  scenario_type: EpdScenarioType;
  trip_id?: string | null;
  deal_id?: string | null;
  document_id?: string | null;
  forwarder_id?: string | null;
  forwarder_possession_mode?: ForwarderPossessionMode | null;
  cargo_holder_role?: CargoHolderRole | null;
  participants?: Record<string, unknown>;
  is_training?: boolean;
}

export async function listScenarios(
  client: AnyClient, carrierExtId: string,
  filters: { trip_id?: string | null; document_id?: string | null } = {},
): Promise<ScenarioRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (client.from("edo_scenarios") as any)
    .select("*")
    .eq("carrier_ext_id", carrierExtId)
    .order("created_at", { ascending: false });
  if (filters.trip_id) q = q.eq("trip_id", filters.trip_id);
  if (filters.document_id) q = q.eq("document_id", filters.document_id);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as ScenarioRow[];
}

export async function getScenario(
  client: AnyClient, carrierExtId: string, id: string,
): Promise<ScenarioRow | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client.from("edo_scenarios") as any)
    .select("*").eq("id", id).eq("carrier_ext_id", carrierExtId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ScenarioRow | null) ?? null;
}

export async function createScenario(
  client: AnyClient, carrierExtId: string, userId: string,
  input: CreateScenarioInput,
): Promise<{ id: string }> {
  const def = getScenarioDef(input.scenario_type);
  if (!def) throw new Error("unknown_scenario_type");
  const row = {
    carrier_ext_id: carrierExtId,
    trip_id: input.trip_id ?? null,
    deal_id: input.deal_id ?? null,
    document_id: input.document_id ?? null,
    scenario_type: input.scenario_type,
    forwarder_id: input.forwarder_id ?? null,
    forwarder_possession_mode:
      input.forwarder_possession_mode ?? def.default_possession_mode,
    cargo_holder_role: input.cargo_holder_role ?? def.cargo_holder_role,
    required_documents: def.required_documents,
    participants_json: input.participants ?? {},
    signing_plan_json: def.signing_plan,
    readiness_status: "draft",
    validation_errors: [],
    validation_warnings: def.warnings,
    is_training: input.is_training ?? false,
    created_by: userId,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client.from("edo_scenarios") as any)
    .insert(row).select("id").single();
  if (error) throw new Error(error.message);
  return { id: (data as { id: string }).id };
}

export async function patchScenario(
  client: AnyClient, carrierExtId: string, id: string,
  patch: Partial<CreateScenarioInput> & {
    readiness_status?: EpdReadinessStatus;
  },
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.forwarder_id !== undefined) row.forwarder_id = patch.forwarder_id;
  if (patch.forwarder_possession_mode !== undefined)
    row.forwarder_possession_mode = patch.forwarder_possession_mode;
  if (patch.cargo_holder_role !== undefined) row.cargo_holder_role = patch.cargo_holder_role;
  if (patch.participants !== undefined) row.participants_json = patch.participants;
  if (patch.readiness_status !== undefined) row.readiness_status = patch.readiness_status;
  if (patch.trip_id !== undefined) row.trip_id = patch.trip_id;
  if (patch.document_id !== undefined) row.document_id = patch.document_id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (client.from("edo_scenarios") as any)
    .update(row).eq("id", id).eq("carrier_ext_id", carrierExtId);
  if (error) throw new Error(error.message);
}

export async function validateScenario(
  client: AnyClient, carrierExtId: string, id: string,
): Promise<ValidationResult> {
  const s = await getScenario(client, carrierExtId, id);
  if (!s) return { errors: ["Сценарий не найден"], warnings: [], readiness: "invalid" };
  const def = getScenarioDef(s.scenario_type);
  const errors: string[] = [];
  const warnings: string[] = [...(def?.warnings ?? [])];

  if (!s.scenario_type) errors.push("Не выбран сценарий перевозки");
  if (def?.requires_forwarder && !s.forwarder_id)
    errors.push("Сценарий требует экспедитора, но он не указан");
  if (def?.requires_forwarder && (!s.forwarder_possession_mode || s.forwarder_possession_mode === "unknown"))
    errors.push("Не выбран режим владения грузом у экспедитора");

  const p = s.participants_json as Record<string, unknown>;
  const need = (key: string, label: string) => {
    if (!p?.[key]) errors.push(`Не указан ${label}`);
  };
  need("shipper", "грузоотправитель");
  need("consignee", "грузополучатель");
  if (def?.participants.includes("carrier")) need("carrier", "перевозчик");
  if (def?.participants.includes("driver")) need("driver", "водитель");

  // готовность перевозчика
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ready } = await (client.from("carrier_epd_readiness") as any)
    .select("*").eq("carrier_ext_id", carrierExtId).maybeSingle();
  const r = ready as Record<string, unknown> | null;
  if (!r) warnings.push("Не заполнена анкета готовности перевозчика к ЭПД");
  else {
    if (!r.edo_operator) errors.push("Не выбран оператор ЭДО/ЭПД у перевозчика");
    if (!r.edo_participant_id) warnings.push("Не указан идентификатор участника ЭДО");
    if (!r.has_director_kep) warnings.push("Нет данных о КЭП руководителя");
    if (!r.has_mchd) warnings.push("Нет МЧД на ответственного сотрудника");
    if (!r.driver_qr_ready) warnings.push("Водитель не подтвердил готовность к QR");
  }

  // ГосЛог экспедитора (если есть)
  if (s.forwarder_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: gl } = await (client.from("forwarder_goslog_status") as any)
      .select("goslog_status").eq("forwarder_id", s.forwarder_id).maybeSingle();
    const status = (gl as { goslog_status?: string } | null)?.goslog_status ?? "unknown";
    if (!["included", "manually_verified"].includes(status))
      warnings.push("Экспедитор не подтверждён в ГосЛог. Проверьте по официальному источнику.");
  }

  const readiness: EpdReadinessStatus =
    errors.length > 0 ? "invalid"
    : warnings.length > 0 ? "valid_with_warnings"
    : "valid";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (client.from("edo_scenarios") as any).update({
    validation_errors: errors,
    validation_warnings: warnings,
    readiness_status: readiness,
  }).eq("id", id).eq("carrier_ext_id", carrierExtId);

  return { errors, warnings, readiness };
}

/** Создаёт заготовки документов на основе required_documents сценария. */
export async function createDocumentsFromScenario(
  client: AnyClient, carrierExtId: string, id: string,
): Promise<{ created: number; document_ids: string[] }> {
  const s = await getScenario(client, carrierExtId, id);
  if (!s) throw new Error("scenario_not_found");
  const docs = (s.required_documents ?? []) as string[];
  const ids: string[] = [];
  for (const code of docs) {
    const row = {
      carrier_ext_id: carrierExtId,
      provider: "internal_mock",
      direction: "outgoing",
      document_type: code === "etrn" ? "etrn" : "other",
      title: code,
      status: "draft",
      scenario_id: s.id,
      is_training: s.is_training,
      meta: { from_scenario: true, scenario_type: s.scenario_type, doc_code: code },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (client.from("carrier_edo_documents") as any)
      .insert(row).select("id").single();
    if (error) throw new Error(error.message);
    ids.push((data as { id: string }).id);
  }
  return { created: ids.length, document_ids: ids };
}

export { EPD_SCENARIO_CATALOG };
