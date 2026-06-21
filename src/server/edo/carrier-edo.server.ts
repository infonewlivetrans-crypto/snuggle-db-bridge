// Серверный слой ЭТрН/ЭДО. Работает через user-client (RLS), а для чтения
// и установки секретов подключения — через service-role (но возвращает
// клиенту только безопасную проекцию без секретов).
import type { SupabaseClient } from "@supabase/supabase-js";
import { getEdoAdapter } from "./providers/registry";
import type {
  EdoProvider,
  EdoConnectionConfig,
  EdoProviderAdapter,
} from "./providers/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

export interface CarrierEdoConnectionSafe {
  id: string;
  carrier_ext_id: string;
  provider: EdoProvider;
  provider_title: string | null;
  status: string;
  environment: "test" | "production";
  is_default: boolean;
  organization_name: string | null;
  organization_inn: string | null;
  external_org_id: string | null;
  box_id: string | null;
  has_client_id: boolean;
  has_client_secret: boolean;
  has_api_key: boolean;
  has_access_token: boolean;
  has_certificate: boolean;
  comment: string | null;
  last_check_at: string | null;
  last_check_status: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/** Возвращает все подключения перевозчика (без секретов). */
export async function listCarrierConnections(
  client: AnyClient,
  carrierExtId: string,
): Promise<CarrierEdoConnectionSafe[]> {
  const { data, error } = await client
    .from("carrier_edo_connections_safe")
    .select("*")
    .eq("carrier_ext_id", carrierExtId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CarrierEdoConnectionSafe[];
}

/** Возвращает первое (или default) подключение перевозчика. Совместимо со старым API. */
export async function getCarrierConnectionSafe(
  client: AnyClient,
  carrierExtId: string,
): Promise<CarrierEdoConnectionSafe | null> {
  const all = await listCarrierConnections(client, carrierExtId);
  if (all.length === 0) return null;
  return all.find(c => c.is_default) ?? all[0];
}


export interface UpsertConnectionInput {
  id?: string | null;
  provider: EdoProvider;
  environment?: "test" | "production";
  organization_name?: string | null;
  organization_inn?: string | null;
  external_org_id?: string | null;
  box_id?: string | null;
  client_id?: string | null;
  client_secret?: string | null;
  api_key?: string | null;
  access_token?: string | null;
  refresh_token?: string | null;
  certificate_id?: string | null;
  comment?: string | null;
  status?: string;
  is_default?: boolean;
}

/** Создаёт новое или обновляет существующее (по id) подключение перевозчика. */
export async function upsertCarrierConnection(
  client: AnyClient,
  carrierExtId: string,
  input: UpsertConnectionInput,
): Promise<{ id: string }> {
  const provider = input.provider;
  const adapter = getEdoAdapter(provider);
  const defaultStatus = provider === "internal_mock" ? "connected" : "setup_required";
  const patch: Record<string, unknown> = {
    carrier_ext_id: carrierExtId,
    provider,
    provider_title: adapter.title,
    environment: input.environment ?? "test",
    organization_name: input.organization_name ?? null,
    organization_inn: input.organization_inn ?? null,
    external_org_id: input.external_org_id ?? null,
    box_id: input.box_id ?? null,
    comment: input.comment ?? null,
    status: input.status ?? defaultStatus,
  };
  for (const k of [
    "client_id", "client_secret", "api_key", "access_token",
    "refresh_token", "certificate_id",
  ] as const) {
    if (input[k] !== undefined && input[k] !== "") patch[k] = input[k];
  }

  let resultId: string;
  if (input.id) {
    const { error } = await client
      .from("carrier_edo_connections")
      .update(patch)
      .eq("id", input.id)
      .eq("carrier_ext_id", carrierExtId);
    if (error) throw new Error(error.message);
    resultId = input.id;
  } else {
    const existing = await listCarrierConnections(client, carrierExtId);
    // первое подключение перевозчика становится основным автоматически
    if (existing.length === 0) patch.is_default = true;
    const { data, error } = await client
      .from("carrier_edo_connections")
      .insert(patch)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    resultId = (data as { id: string }).id;
  }

  if (input.is_default === true) {
    await setDefaultConnection(client, carrierExtId, resultId);
  }
  return { id: resultId };
}

/** Делает указанное подключение основным (снимает флаг у остальных). */
export async function setDefaultConnection(
  client: AnyClient,
  carrierExtId: string,
  connectionId: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = client as any;
  await c.from("carrier_edo_connections")
    .update({ is_default: false })
    .eq("carrier_ext_id", carrierExtId)
    .neq("id", connectionId);
  const { error } = await c.from("carrier_edo_connections")
    .update({ is_default: true })
    .eq("id", connectionId)
    .eq("carrier_ext_id", carrierExtId);
  if (error) throw new Error(error.message);
}

export async function deleteCarrierConnection(
  client: AnyClient,
  carrierExtId: string,
  connectionId: string,
): Promise<void> {
  const { error } = await client
    .from("carrier_edo_connections")
    .delete()
    .eq("id", connectionId)
    .eq("carrier_ext_id", carrierExtId);
  if (error) throw new Error(error.message);
}


/** Загружает полный конфиг (с секретами) — только из серверного контекста с user-client.
 *  Если передан connectionId — берёт его; иначе — основной (is_default) или первый. */
export async function loadConnectionConfig(
  client: AnyClient,
  carrierExtId: string,
  connectionId?: string | null,
): Promise<{ id: string; cfg: EdoConnectionConfig; adapter: EdoProviderAdapter } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (client.from("carrier_edo_connections") as any)
    .select("*")
    .eq("carrier_ext_id", carrierExtId);
  if (connectionId) {
    q = q.eq("id", connectionId);
  } else {
    q = q.order("is_default", { ascending: false }).order("created_at", { ascending: true });
  }
  const { data, error } = await q.limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as Record<string, unknown>;
  const provider = (row.provider as EdoProvider) ?? "internal_mock";
  return {
    id: row.id as string,
    adapter: getEdoAdapter(provider),
    cfg: {
      provider,
      environment: (row.environment as "test" | "production") ?? "test",
      client_id: (row.client_id as string | null) ?? null,
      client_secret: (row.client_secret as string | null) ?? null,
      api_key: (row.api_key as string | null) ?? null,
      access_token: (row.access_token as string | null) ?? null,
      refresh_token: (row.refresh_token as string | null) ?? null,
      certificate_id: (row.certificate_id as string | null) ?? null,
      external_org_id: (row.external_org_id as string | null) ?? null,
      box_id: (row.box_id as string | null) ?? null,
      organization_name: (row.organization_name as string | null) ?? null,
      organization_inn: (row.organization_inn as string | null) ?? null,
    },
  };
}


export async function updateConnectionCheckStatus(
  client: AnyClient,
  id: string,
  result: { ok: boolean; error?: string },
) {
  await client
    .from("carrier_edo_connections")
    .update({
      last_check_at: new Date().toISOString(),
      last_check_status: result.ok ? "ok" : "error",
      error_message: result.ok ? null : (result.error ?? null),
      status: result.ok ? "connected" : "error",
    })
    .eq("id", id);
}

// ============ DOCUMENTS ============

export interface CreateDocInput {
  direction?: "incoming" | "outgoing" | "internal";
  document_type?: "etrn" | "upd" | "act" | "contract" | "invoice" | "transport_waybill" | "other";
  title?: string | null;
  document_date?: string | null;
  shipper_name?: string | null;
  shipper_inn?: string | null;
  shipper_provider?: EdoProvider | null;
  consignee_name?: string | null;
  consignee_inn?: string | null;
  consignee_provider?: EdoProvider | null;
  route_summary?: string | null;
  loading_city?: string | null;
  unloading_city?: string | null;
  cargo_summary?: string | null;
  vehicle_label?: string | null;
  driver_label?: string | null;
  loading_at?: string | null;
  unloading_at?: string | null;
  rate_amount?: number | null;
  doc_number?: string | null;
  freight_id?: string | null;
  trip_id?: string | null;
  connection_id?: string | null;
  comment?: string | null;
  meta?: Record<string, unknown> | null;
}

export async function createCarrierDoc(
  client: AnyClient,
  carrierExtId: string,
  input: CreateDocInput,
): Promise<{ id: string }> {
  const conn = await loadConnectionConfig(client, carrierExtId, input.connection_id ?? null);
  const provider: EdoProvider = conn?.cfg.provider ?? "internal_mock";
  const adapter = getEdoAdapter(provider);
  const direction = input.direction ?? "outgoing";
  const documentType = input.document_type ?? "etrn";

  let externalId: string | null = null;
  let status: string = direction === "incoming" ? "waiting_carrier_signature" : "draft";
  if (provider === "internal_mock" && direction === "outgoing") {
    const r = await adapter.createEtrn(conn?.cfg ?? buildMockCfg(), input);
    if (r.ok && r.data) {
      externalId = (r.data as { external_id?: string }).external_id ?? null;
      status = "created";
    }
  } else if (provider === "internal_mock" && direction === "incoming") {
    externalId = `mock-in-${Date.now()}`;
  }

  const { data, error } = await client
    .from("carrier_edo_documents")
    .insert({
      carrier_ext_id: carrierExtId,
      connection_id: conn?.id ?? null,
      provider,
      external_id: externalId,
      status,
      direction,
      document_type: documentType,
      title: input.title ?? null,
      document_date: input.document_date ?? null,
      doc_number: input.doc_number ?? null,
      shipper_name: input.shipper_name ?? null,
      shipper_inn: input.shipper_inn ?? null,
      consignee_name: input.consignee_name ?? null,
      consignee_inn: input.consignee_inn ?? null,
      route_summary: input.route_summary ?? null,
      loading_city: input.loading_city ?? null,
      unloading_city: input.unloading_city ?? null,
      cargo_summary: input.cargo_summary ?? null,
      vehicle_label: input.vehicle_label ?? null,
      driver_label: input.driver_label ?? null,
      loading_at: input.loading_at ?? null,
      unloading_at: input.unloading_at ?? null,
      rate_amount: input.rate_amount ?? null,
      freight_id: input.freight_id ?? null,
      trip_id: input.trip_id ?? null,
      meta: input.meta ?? {},
      awaiting_role:
        direction === "incoming" ? "carrier" :
        status === "created" ? "carrier" : null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const id = (data as { id: string }).id;

  // Заводим стандартных участников. Для входящего — сразу помечаем грузоотправителя подписавшим.
  const shipperSigned = direction === "incoming";
  const participants: Array<Record<string, unknown>> = [
    {
      role: "shipper",
      name: input.shipper_name ?? null,
      inn: input.shipper_inn ?? null,
      participant_operator_provider: input.shipper_provider ?? null,
      participant_signature_status: shipperSigned ? "signed" : "pending",
      participant_sign_method: shipperSigned ? "mock" : null,
      signed_at: shipperSigned ? new Date().toISOString() : null,
    },
    {
      role: "carrier",
      name: conn?.cfg.organization_name ?? null,
      inn: conn?.cfg.organization_inn ?? null,
      participant_operator_provider: provider,
    },
    { role: "driver", name: input.driver_label ?? null },
    {
      role: "consignee",
      name: input.consignee_name ?? null,
      inn: input.consignee_inn ?? null,
      participant_operator_provider: input.consignee_provider ?? null,
    },
  ];
  for (const p of participants) {
    await client.from("carrier_edo_document_participants").insert({
      document_id: id,
      ...p,
    });
  }

  await logDocEvent(
    client, id,
    direction === "incoming" ? "received" : "created",
    direction === "incoming" ? "Получен входящий документ" : "Документ создан",
  );
  return { id };
}


function buildMockCfg(): EdoConnectionConfig {
  return {
    provider: "internal_mock",
    environment: "test",
    client_id: null, client_secret: null, api_key: null,
    access_token: null, refresh_token: null, certificate_id: null,
    external_org_id: null, box_id: null,
    organization_name: null, organization_inn: null,
  };
}

export async function logDocEvent(
  client: AnyClient,
  documentId: string,
  eventType: string,
  message?: string,
  actorRole?: string,
) {
  await client.from("carrier_edo_document_events").insert({
    document_id: documentId,
    event_type: eventType,
    message: message ?? null,
    actor_role: actorRole ?? null,
  });
}

export async function setDocStatus(
  client: AnyClient,
  documentId: string,
  status: string,
  awaitingRole: string | null,
  message?: string,
) {
  const { error } = await client
    .from("carrier_edo_documents")
    .update({ status, awaiting_role: awaitingRole })
    .eq("id", documentId);
  if (error) throw new Error(error.message);
  await logDocEvent(client, documentId, `status:${status}`, message);
}

export async function setParticipantSigned(
  client: AnyClient,
  documentId: string,
  role: string,
  method: string,
) {
  await client
    .from("carrier_edo_document_participants")
    .update({
      participant_signature_status: "signed",
      participant_sign_method: method,
      signed_at: new Date().toISOString(),
    })
    .eq("document_id", documentId)
    .eq("role", role);
}

// ============ COUNTERPARTIES (Этап 1 + Этап 2: роли и проверка по ИНН) ============

export type EdoCpVerificationStatus = "unknown" | "verified" | "not_found" | "error";
export type EdoCpRole = "shipper" | "consignee" | "both";

export interface EdoCounterpartyDTO {
  id: string;
  carrier_ext_id: string | null;
  name: string;
  company_name: string | null;
  inn: string | null;
  kpp: string | null;
  type: string;
  edo_operator: string | null;
  edo_provider: string | null;
  edo_provider_title: string | null;
  participant_id: string | null;
  external_org_id: string | null;
  box_id: string | null;
  email: string | null;
  phone: string | null;
  contact_person: string | null;
  address: string | null;
  role: EdoCpRole;
  comment: string | null;
  verification_status: EdoCpVerificationStatus;
  last_sync_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CounterpartyListParams {
  search?: string | null;
  verification_status?: EdoCpVerificationStatus | null;
  role?: EdoCpRole | null;
  include_archived?: boolean;
}

export interface CounterpartyInput {
  company_name?: string | null;
  name?: string | null;
  inn?: string | null;
  kpp?: string | null;
  edo_operator?: string | null;
  participant_id?: string | null;
  email?: string | null;
  phone?: string | null;
  contact_person?: string | null;
  address?: string | null;
  role?: EdoCpRole | null;
  comment?: string | null;
  verification_status?: EdoCpVerificationStatus | null;
}

function cpRow(r: Record<string, unknown>): EdoCounterpartyDTO {
  return r as unknown as EdoCounterpartyDTO;
}

export async function listCounterparties(
  client: AnyClient,
  carrierExtId: string,
  params: CounterpartyListParams = {},
): Promise<EdoCounterpartyDTO[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (client.from("edo_counterparties") as any)
    .select("*")
    .eq("carrier_ext_id", carrierExtId);
  if (!params.include_archived) q = q.is("archived_at", null);
  if (params.verification_status) q = q.eq("verification_status", params.verification_status);
  if (params.role) {
    if (params.role === "shipper") q = q.in("role", ["shipper", "both"]);
    else if (params.role === "consignee") q = q.in("role", ["consignee", "both"]);
    else q = q.eq("role", "both");
  }
  if (params.search && params.search.trim()) {
    const s = params.search.trim().replace(/[%,]/g, " ");
    q = q.or(`company_name.ilike.%${s}%,name.ilike.%${s}%,inn.ilike.%${s}%`);
  }
  q = q.order("created_at", { ascending: false }).limit(500);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map(cpRow);
}

export async function getCounterparty(
  client: AnyClient,
  carrierExtId: string,
  id: string,
): Promise<EdoCounterpartyDTO | null> {
  const { data, error } = await client
    .from("edo_counterparties")
    .select("*")
    .eq("carrier_ext_id", carrierExtId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? cpRow(data as Record<string, unknown>) : null;
}

function normalizeCpPatch(input: CounterpartyInput): Record<string, unknown> {
  const displayName = (input.company_name ?? input.name ?? "").trim();
  const patch: Record<string, unknown> = {
    company_name: input.company_name?.trim() || null,
    inn: input.inn?.trim() || null,
    kpp: input.kpp?.trim() || null,
    edo_operator: input.edo_operator?.trim() || null,
    participant_id: input.participant_id?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    contact_person: input.contact_person?.trim() || null,
    address: input.address?.trim() || null,
    comment: input.comment?.trim() || null,
  };
  if (input.role && ["shipper", "consignee", "both"].includes(input.role)) {
    patch.role = input.role;
  }
  if (input.verification_status) patch.verification_status = input.verification_status;
  if (displayName) patch.name = displayName;
  return patch;
}

export async function createCounterparty(
  client: AnyClient,
  carrierExtId: string,
  input: CounterpartyInput,
): Promise<{ id: string }> {
  const displayName = (input.company_name ?? input.name ?? "").trim();
  if (!displayName) throw new Error("Не указано наименование контрагента");
  const patch = normalizeCpPatch(input);
  patch.carrier_ext_id = carrierExtId;
  patch.name = displayName;
  if (!patch.verification_status) patch.verification_status = "unknown";
  if (!patch.role) patch.role = "both";
  const { data, error } = await client
    .from("edo_counterparties")
    .insert(patch)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: (data as { id: string }).id };
}

export async function updateCounterparty(
  client: AnyClient,
  carrierExtId: string,
  id: string,
  input: CounterpartyInput,
): Promise<void> {
  const patch = normalizeCpPatch(input);
  patch.updated_at = new Date().toISOString();
  const { error } = await client
    .from("edo_counterparties")
    .update(patch)
    .eq("id", id)
    .eq("carrier_ext_id", carrierExtId);
  if (error) throw new Error(error.message);
}

export async function archiveCounterparty(
  client: AnyClient,
  carrierExtId: string,
  id: string,
): Promise<void> {
  const { error } = await client
    .from("edo_counterparties")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("carrier_ext_id", carrierExtId);
  if (error) throw new Error(error.message);
}

// ===== Этап 2: mock-проверка контрагента по ИНН =====
// Архитектурно — обёртка, которую позже можно заменить на реальные адаптеры
// операторов ЭДО (СБИС, Диадок, Такском, Астрал) без изменения UI/API.

export interface VerifyCounterpartyResult {
  ok: boolean;
  status: EdoCpVerificationStatus;
  message?: string;
  edo_operator?: string | null;
  participant_id?: string | null;
}

function mockVerifyByInn(
  inn: string,
  current: { edo_operator: string | null; participant_id: string | null },
): VerifyCounterpartyResult {
  const clean = inn.trim();
  if (!clean) {
    return { ok: false, status: "error", message: "ИНН не указан" };
  }
  if (!/^\d{10}$|^\d{12}$/.test(clean)) {
    return { ok: false, status: "error", message: "ИНН должен содержать 10 или 12 цифр" };
  }
  const first = clean[0];
  if (first === "7" || first === "8") {
    return {
      ok: true,
      status: "verified",
      edo_operator: "mock_operator",
      participant_id: `MOCK-${clean}`,
      message: "Контрагент найден (mock-проверка)",
    };
  }
  if (first === "0") {
    return {
      ok: true,
      status: "not_found",
      edo_operator: null,
      participant_id: null,
      message: "Контрагент не найден в реестре операторов (mock)",
    };
  }
  return {
    ok: true,
    status: "error",
    edo_operator: current.edo_operator,
    participant_id: current.participant_id,
    message: "Не удалось проверить контрагента (mock)",
  };
}

export async function verifyCounterparty(
  client: AnyClient,
  carrierExtId: string,
  id: string,
): Promise<VerifyCounterpartyResult> {
  const cp = await getCounterparty(client, carrierExtId, id);
  if (!cp) throw new Error("Контрагент не найден");
  const result = mockVerifyByInn(cp.inn ?? "", {
    edo_operator: cp.edo_operator,
    participant_id: cp.participant_id,
  });

  const patch: Record<string, unknown> = {
    verification_status: result.status,
    last_sync_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (result.status === "verified") {
    if (result.edo_operator !== undefined) patch.edo_operator = result.edo_operator;
    if (result.participant_id !== undefined) patch.participant_id = result.participant_id;
  } else if (result.status === "not_found") {
    // Не затираем ручные значения — оставляем как есть.
  }

  const { error } = await client
    .from("edo_counterparties")
    .update(patch)
    .eq("id", id)
    .eq("carrier_ext_id", carrierExtId);
  if (error) throw new Error(error.message);

  return result;
}

