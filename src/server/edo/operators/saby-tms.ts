// Saby TMS адаптер в формате EdoOperatorAdapter (нового контура отправки).
// Делегирует низкоуровневые вызовы в saby-client (mock / api_ready / live).
import type {
  EdoOperatorAdapter,
  CreateDocumentResult,
  SendDocumentResult,
  DocumentStatusResult,
  CounterpartyCheckResult,
} from "./types";
import { callSabyMethod, describeConnection } from "./saby-client";
import type { SabyConnectionSettings } from "./saby-types";

function cfgToSaby(cfg: unknown): SabyConnectionSettings {
  const c = (cfg ?? {}) as Record<string, unknown>;
  return {
    api_base_url: (c.api_base_url as string) ?? null,
    login: (c.login as string) ?? null,
    password: (c.password as string) ?? null,
    app_client_id: (c.client_id as string) ?? (c.app_client_id as string) ?? null,
    app_secret: (c.client_secret as string) ?? (c.app_secret as string) ?? null,
    token: (c.access_token as string) ?? (c.token as string) ?? null,
    refresh_token: (c.refresh_token as string) ?? null,
    organization_id: (c.external_org_id as string) ?? (c.organization_id as string) ?? null,
    edo_box_id: (c.box_id as string) ?? (c.edo_box_id as string) ?? null,
    certificate_thumbprint: (c.certificate_thumbprint as string) ?? null,
    signing_mode: (c.signing_mode as SabyConnectionSettings["signing_mode"]) ?? null,
    integration_mode: (c.integration_mode as SabyConnectionSettings["integration_mode"]) ?? "mock",
  };
}

function shortId(prefix: string): string {
  const r = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${r}`;
}

export const sabyOperatorAdapter: EdoOperatorAdapter = {
  code: "saby_tms",
  title: "Saby TMS",

  async checkCounterpartyByInn(cfg, inn) {
    const settings = cfgToSaby(cfg);
    const r = await callSabyMethod<unknown>(settings, "readDocument", { Параметры: { ИНН: inn } });
    if (!r.ok) return { ok: false, error: r.error };
    const data: CounterpartyCheckResult = {
      found: true,
      organization_name: `Saby mock ${inn}`,
      edo_operator: "saby_tms",
      participant_id: `SABY-${inn}`,
      message: `Mock-проверка через Saby (${r.mode})`,
    };
    return { ok: true, data };
  },

  async createDocument(cfg, draft) {
    const settings = cfgToSaby(cfg);
    const r = await callSabyMethod<{ method: string }>(settings, "writeDocument", {
      Документ: draft,
      Подключение: describeConnection(settings),
    });
    if (!r.ok) return { ok: false, error: r.error };
    const data: CreateDocumentResult = {
      operator_document_id: shortId("SABY-DOC"),
      operator_status: "saby_created",
    };
    return { ok: true, data };
  },

  async sendDocument(cfg, operatorDocumentId) {
    const settings = cfgToSaby(cfg);
    const r = await callSabyMethod(settings, "executeAction", {
      Документ: operatorDocumentId,
      Действие: "Отправить",
    });
    if (!r.ok) return { ok: false, error: r.error };
    const data: SendDocumentResult = {
      operator_document_id: operatorDocumentId || shortId("SABY-DOC"),
      operator_status: "saby_sent",
      sent_at: new Date().toISOString(),
    };
    return { ok: true, data };
  },

  async getDocumentStatus(cfg, operatorDocumentId) {
    const settings = cfgToSaby(cfg);
    const r = await callSabyMethod(settings, "readDocument", { Документ: operatorDocumentId });
    if (!r.ok) return { ok: false, error: r.error };
    const data: DocumentStatusResult = {
      operator_status: "saby_sent",
      message: `Saby (${r.mode}) — статус не меняется автоматически`,
    };
    return { ok: true, data };
  },

  async listIncomingDocuments(cfg) {
    const settings = cfgToSaby(cfg);
    const r = await callSabyMethod(settings, "getChanges", {});
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, data: [] };
  },
};
