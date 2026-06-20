// СберКорус — каркас адаптера. Авторизация: api_key + OAuth.
import { type EdoProviderAdapter, notConfigured } from "./types";

function need(cfg: { api_key: string | null }) {
  if (!cfg.api_key) return notConfigured("СберКорус");
  return null;
}

export const sberkorusAdapter: EdoProviderAdapter = {
  provider: "sberkorus",
  title: "СберКорус",
  async testConnection(cfg) { return need(cfg) ?? { ok: true }; },
  async getOrganizationInfo(cfg) { return need(cfg) ?? notConfigured("СберКорус"); },
  async createEtrn(cfg) { return need(cfg) ?? notConfigured("СберКорус"); },
  async getEtrnStatus(cfg) { return need(cfg) ?? notConfigured("СберКорус"); },
  async sendForSignature(cfg) { return need(cfg) ?? notConfigured("СберКорус"); },
  async signAsCarrier(cfg) { return need(cfg) ?? notConfigured("СберКорус"); },
  async confirmDriverAction(cfg) { return need(cfg) ?? notConfigured("СберКорус"); },
  async getIncomingDocuments(cfg) { return need(cfg) ?? notConfigured("СберКорус"); },
  async downloadDocument(cfg) { return need(cfg) ?? notConfigured("СберКорус"); },
  async cancelDocument(cfg) { return need(cfg) ?? notConfigured("СберКорус"); },
  async closeDocument(cfg) { return need(cfg) ?? notConfigured("СберКорус"); },
};
