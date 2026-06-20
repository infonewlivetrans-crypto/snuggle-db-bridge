// Внутренний mock-провайдер: полный процесс ЭТрН без внешних вызовов.
// Возвращает успешные ответы и генерирует фейковые внешние ID, чтобы
// можно было тестировать UI и переходы статусов без договора с оператором.
import type { EdoProviderAdapter } from "./types";

function genId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`;
}

export const internalMockAdapter: EdoProviderAdapter = {
  provider: "internal_mock",
  title: "Внутренний режим Радиус Трек",

  async testConnection() {
    return { ok: true, data: { mode: "internal_mock" } };
  },
  async getOrganizationInfo(cfg) {
    return {
      ok: true,
      data: {
        external_org_id: cfg.external_org_id ?? "mock-org",
        organization_name: cfg.organization_name ?? "Внутренняя организация",
        organization_inn: cfg.organization_inn ?? null,
      },
    };
  },
  async createEtrn() {
    return { ok: true, data: { external_id: genId("etrn") } };
  },
  async getEtrnStatus(_cfg, externalId) {
    return { ok: true, data: { status: "ok", externalId } as any };
  },
  async sendForSignature() {
    return { ok: true };
  },
  async signAsCarrier() {
    return { ok: true };
  },
  async confirmDriverAction() {
    return { ok: true };
  },
  async getIncomingDocuments() {
    return { ok: true, data: [] };
  },
  async downloadDocument(_cfg, externalId) {
    return { ok: true, data: { url: `mock://document/${externalId}` } };
  },
  async cancelDocument() {
    return { ok: true };
  },
  async closeDocument() {
    return { ok: true };
  },
};
