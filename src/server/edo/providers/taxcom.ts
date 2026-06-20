// Такском — каркас адаптера. Авторизация: api_key + certificate.
import { type EdoProviderAdapter, notConfigured } from "./types";

function need(cfg: { api_key: string | null }) {
  if (!cfg.api_key) return notConfigured("Такском");
  return null;
}

export const taxcomAdapter: EdoProviderAdapter = {
  provider: "taxcom",
  title: "Такском",
  async testConnection(cfg) { return need(cfg) ?? { ok: true }; },
  async getOrganizationInfo(cfg) { return need(cfg) ?? notConfigured("Такском"); },
  async createEtrn(cfg) { return need(cfg) ?? notConfigured("Такском"); },
  async getEtrnStatus(cfg) { return need(cfg) ?? notConfigured("Такском"); },
  async sendForSignature(cfg) { return need(cfg) ?? notConfigured("Такском"); },
  async signAsCarrier(cfg) { return need(cfg) ?? notConfigured("Такском"); },
  async confirmDriverAction(cfg) { return need(cfg) ?? notConfigured("Такском"); },
  async getIncomingDocuments(cfg) { return need(cfg) ?? notConfigured("Такском"); },
  async downloadDocument(cfg) { return need(cfg) ?? notConfigured("Такском"); },
  async cancelDocument(cfg) { return need(cfg) ?? notConfigured("Такском"); },
  async closeDocument(cfg) { return need(cfg) ?? notConfigured("Такском"); },
};
