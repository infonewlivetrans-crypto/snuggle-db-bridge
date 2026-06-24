// Серверные операции Saby TMS поверх carrier_edo_documents.
// Работают через user-client (RLS). Не используют service_role.
// Реальные HTTP-запросы пока не выполняются — mock/api_ready режимы.
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadConnectionConfig, logDocEvent } from "@/server/edo/carrier-edo.server";
import { mapRadiusDocToSaby, type RadiusDocLike } from "@/server/edo/operators/saby-route-mapper";
import { buildSabyDocumentPayload, buildMockParticipantLinks } from "@/server/edo/operators/saby-mapper";
import { describeConnection, resolveMode } from "@/server/edo/operators/saby-client";
import type { SabyConnectionSettings } from "@/server/edo/operators/saby-types";
import { sabyOperatorAdapter } from "@/server/edo/operators/saby-tms";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

async function loadDoc(client: AnyClient, carrierExtId: string, docId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client.from("carrier_edo_documents") as any)
    .select("*")
    .eq("id", docId)
    .eq("carrier_ext_id", carrierExtId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown> | null;
}

function settingsFromConnection(conn: Awaited<ReturnType<typeof loadConnectionConfig>>): SabyConnectionSettings {
  // Полный конфиг подключения, расширенный Saby-полями. loadConnectionConfig
  // возвращает только базовые поля — Saby-настройки лежат в той же строке
  // подключения, но требуют отдельной выборки в будущем. Сейчас работаем в mock.
  const c = (conn?.cfg ?? {}) as Record<string, unknown>;
  return {
    api_base_url: null,
    login: null,
    password: null,
    app_client_id: (c.client_id as string) ?? null,
    app_secret: (c.client_secret as string) ?? null,
    token: (c.access_token as string) ?? null,
    refresh_token: (c.refresh_token as string) ?? null,
    organization_id: (c.external_org_id as string) ?? null,
    edo_box_id: (c.box_id as string) ?? null,
    certificate_thumbprint: null,
    signing_mode: "manual_link",
    integration_mode: "mock",
  };
}

export async function sabyPrepareDocument(
  client: AnyClient, carrierExtId: string, docId: string,
): Promise<{ ok: boolean; missing?: string[]; error?: string; epd_errors?: string[] }> {
  const doc = await loadDoc(client, carrierExtId, docId);
  if (!doc) return { ok: false, error: "not_found" };
  if ((doc as { is_training?: boolean }).is_training) {
    return { ok: false, error: "training_document_blocked" };
  }

  // Проверка ЭПД-сценария: если он привязан — валидируем.
  const scenarioId = (doc as { scenario_id?: string | null }).scenario_id ?? null;
  let epdContext: Record<string, unknown> | null = null;
  if (scenarioId) {
    const { validateScenario, getScenario } = await import("@/server/edo/scenarios.server");
    const v = await validateScenario(client, carrierExtId, scenarioId);
    if (v.errors.length) return { ok: false, error: "scenario_invalid", epd_errors: v.errors };
    const s = await getScenario(client, carrierExtId, scenarioId);
    if (s) {
      epdContext = {
        scenario_type: s.scenario_type,
        forwarder_possession_mode: s.forwarder_possession_mode,
        cargo_holder_role: s.cargo_holder_role,
        required_documents: s.required_documents,
        signing_plan: s.signing_plan_json,
        validation_warnings: v.warnings,
        is_training: s.is_training,
      };
    }
  }

  const { draft, missing } = mapRadiusDocToSaby(doc as RadiusDocLike);
  if (missing.length) return { ok: false, missing };
  const payload = buildSabyDocumentPayload(draft);
  if (epdContext) (payload as Record<string, unknown>).epd_context = epdContext;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (client.from("carrier_edo_documents") as any)
    .update({
      status: "prepared",
      payload_json: payload,
      epd_context_snapshot: epdContext,
    })
    .eq("id", docId)
    .eq("carrier_ext_id", carrierExtId);
  await logDocEvent(client, docId, "saby:prepare", "Документ подготовлен для Saby (mock)");
  return { ok: true };
}

export async function sabySendDocument(
  client: AnyClient, carrierExtId: string, docId: string,
): Promise<{ ok: boolean; error?: string; operator_status?: string }> {
  const doc = await loadDoc(client, carrierExtId, docId);
  if (!doc) return { ok: false, error: "not_found" };
  if ((doc as { is_training?: boolean }).is_training) {
    return { ok: false, error: "training_document_blocked" };
  }
  const conn = await loadConnectionConfig(client, carrierExtId);
  const settings = settingsFromConnection(conn);
  const { draft } = mapRadiusDocToSaby(doc as RadiusDocLike);
  const created = await sabyOperatorAdapter.createDocument({ code: "saby_tms", ...settings } as any, {
    document_type: draft.document_type,
    doc_number: draft.doc_number ?? null,
    shipper_name: draft.shipper?.name ?? null,
    shipper_inn: draft.shipper?.inn ?? null,
    consignee_name: draft.consignee?.name ?? null,
    consignee_inn: draft.consignee?.inn ?? null,
    driver_label: draft.driver?.full_name ?? null,
    vehicle_label: draft.vehicle?.plate ?? null,
    route_summary: null,
    cargo_summary: draft.cargo?.description ?? null,
    loading_at: draft.route?.loading_at ?? null,
    unloading_at: draft.route?.unloading_at ?? null,
    payload: buildSabyDocumentPayload(draft),
  });
  if (!created.ok || !created.data) {
    return { ok: false, error: created.error ?? "saby_create_failed" };
  }
  const sent = await sabyOperatorAdapter.sendDocument(
    { code: "saby_tms", ...settings } as any,
    created.data.operator_document_id,
  );
  if (!sent.ok || !sent.data) {
    return { ok: false, error: sent.error ?? "saby_send_failed" };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (client.from("carrier_edo_documents") as any)
    .update({
      status: "sent_to_operator",
      saby_document_id: created.data.operator_document_id,
      operator_document_id: created.data.operator_document_id,
      operator_status: sent.data.operator_status,
      sent_at: sent.data.sent_at,
      integration_mode: resolveMode(settings),
    })
    .eq("id", docId)
    .eq("carrier_ext_id", carrierExtId);
  await logDocEvent(client, docId, "saby:send",
    `Отправлено в Saby (${resolveMode(settings)})`);
  return { ok: true, operator_status: sent.data.operator_status };
}

export async function sabyExecuteAction(
  client: AnyClient, carrierExtId: string, docId: string, action: string,
): Promise<{ ok: boolean; error?: string }> {
  const doc = await loadDoc(client, carrierExtId, docId);
  if (!doc) return { ok: false, error: "not_found" };
  await logDocEvent(client, docId, `saby:action:${action}`, `Saby действие: ${action} (mock)`);
  return { ok: true };
}

export async function sabyGetStatus(
  client: AnyClient, carrierExtId: string, docId: string,
): Promise<{ ok: boolean; operator_status?: string | null; error?: string }> {
  const doc = await loadDoc(client, carrierExtId, docId);
  if (!doc) return { ok: false, error: "not_found" };
  const conn = await loadConnectionConfig(client, carrierExtId);
  const settings = settingsFromConnection(conn);
  const opDocId = (doc.saby_document_id as string) ?? (doc.operator_document_id as string) ?? "";
  if (!opDocId) return { ok: true, operator_status: (doc.operator_status as string) ?? null };
  const r = await sabyOperatorAdapter.getDocumentStatus(
    { code: "saby_tms", ...settings } as any, opDocId,
  );
  if (!r.ok || !r.data) return { ok: false, error: r.error ?? "saby_status_failed" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (client.from("carrier_edo_documents") as any)
    .update({ operator_status: r.data.operator_status, last_synced_at: new Date().toISOString() })
    .eq("id", docId).eq("carrier_ext_id", carrierExtId);
  return { ok: true, operator_status: r.data.operator_status };
}

export async function sabyGenerateLinks(
  client: AnyClient, carrierExtId: string, docId: string,
): Promise<{ ok: boolean; participant_links?: Record<string, string | null>; error?: string }> {
  const doc = await loadDoc(client, carrierExtId, docId);
  if (!doc) return { ok: false, error: "not_found" };
  const opDocId = (doc.saby_document_id as string)
    ?? (doc.operator_document_id as string)
    ?? (doc.id as string);
  const links = buildMockParticipantLinks(opDocId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (client.from("carrier_edo_documents") as any)
    .update({ participant_links: links })
    .eq("id", docId).eq("carrier_ext_id", carrierExtId);
  await logDocEvent(client, docId, "saby:links", "Сгенерированы ссылки участникам (mock)");
  return { ok: true, participant_links: links as Record<string, string | null> };
}

export async function exportTo1c(
  client: AnyClient, carrierExtId: string, docId: string,
): Promise<{ ok: boolean; error?: string }> {
  const doc = await loadDoc(client, carrierExtId, docId);
  if (!doc) return { ok: false, error: "not_found" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (client.from("carrier_edo_documents") as any)
    .update({
      export_to_1c_status: "pending",
      onec_exchange_direction: "to_1c",
      export_to_1c_error: null,
    })
    .eq("id", docId).eq("carrier_ext_id", carrierExtId);
  await logDocEvent(client, docId, "1c:export", "Заявка на выгрузку в 1С поставлена (mock)");
  return { ok: true };
}

export async function importFrom1cStatus(
  client: AnyClient, carrierExtId: string, docId: string,
  body: { status?: string; external_1c_id?: string | null; error?: string | null },
): Promise<{ ok: boolean }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (client.from("carrier_edo_documents") as any)
    .update({
      export_to_1c_status: body.status ?? "exported",
      exported_to_1c_at: new Date().toISOString(),
      external_1c_id: body.external_1c_id ?? null,
      export_to_1c_error: body.error ?? null,
      onec_exchange_direction: "from_1c",
    })
    .eq("id", docId).eq("carrier_ext_id", carrierExtId);
  await logDocEvent(client, docId, "1c:status",
    `1С статус: ${body.status ?? "exported"}`);
  return { ok: true };
}

export async function sabySync(
  client: AnyClient, carrierExtId: string,
): Promise<{ ok: boolean; mode: string; touched: number }> {
  const conn = await loadConnectionConfig(client, carrierExtId);
  const settings = settingsFromConnection(conn);
  const mode = resolveMode(settings);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (client.from("carrier_edo_documents") as any)
    .select("id")
    .eq("carrier_ext_id", carrierExtId)
    .eq("provider", "saby_tms");
  const ids = (data ?? []) as Array<{ id: string }>;
  if (ids.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client.from("carrier_edo_documents") as any)
      .update({ last_synced_at: new Date().toISOString(), last_sync_status: `saby:${mode}` })
      .in("id", ids.map(r => r.id));
  }
  return { ok: true, mode, touched: ids.length };
}

export function getSabyConnectionPreview(
  conn: Awaited<ReturnType<typeof loadConnectionConfig>>,
): Record<string, unknown> {
  return describeConnection(settingsFromConnection(conn));
}
