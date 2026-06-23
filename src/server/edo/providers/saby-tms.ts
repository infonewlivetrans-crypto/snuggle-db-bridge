// Saby TMS — провайдер ЭДО. Изолированная заглушка адаптера.
// Реальные HTTP-запросы пока не выполняются — только подготовка payload
// и mock-ответы. Карта методов и API-клиент живут в src/server/edo/operators/.
import type { EdoProviderAdapter } from "./types";
import { notConfigured } from "./types";

function genId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`;
}

function mode(cfg: Record<string, unknown>): "mock" | "api_ready" | "live" {
  const m = cfg.integration_mode;
  if (m === "api_ready" || m === "live") return m;
  return "mock";
}

export const sabyTmsAdapter: EdoProviderAdapter = {
  provider: "saby_tms",
  title: "Saby TMS",

  async testConnection(cfg) {
    const m = mode(cfg as unknown as Record<string, unknown>);
    if (m === "live") return notConfigured("saby_tms (live ещё не подключён)");
    if (m === "api_ready") {
      const missing: string[] = [];
      if (!cfg.client_id) missing.push("app_client_id");
      if (!cfg.client_secret) missing.push("app_secret");
      if (!cfg.external_org_id) missing.push("organization_id");
      if (missing.length) {
        return { ok: false, error: `Не хватает настроек: ${missing.join(", ")}` };
      }
      return { ok: true, data: { mode: "api_ready" } };
    }
    return { ok: true, data: { mode: "mock" } };
  },

  async getOrganizationInfo(cfg) {
    return {
      ok: true,
      data: {
        external_org_id: cfg.external_org_id ?? "saby-mock-org",
        organization_name: cfg.organization_name ?? "Saby mock organization",
        organization_inn: cfg.organization_inn ?? null,
      },
    };
  },

  async createEtrn() {
    return { ok: true, data: { external_id: genId("saby_doc") } };
  },
  async getEtrnStatus(_cfg, externalId) {
    return { ok: true, data: { status: "saby_mock_pending", externalId } };
  },
  async sendForSignature() { return { ok: true }; },
  async signAsCarrier() { return { ok: true }; },
  async confirmDriverAction() { return { ok: true }; },
  async getIncomingDocuments() { return { ok: true, data: [] }; },
  async downloadDocument(_cfg, externalId) {
    return { ok: true, data: { url: `saby://document/${externalId}` } };
  },
  async cancelDocument() { return { ok: true }; },
  async closeDocument() { return { ok: true }; },
};
