// СБИС — каркас адаптера. Авторизация: client_id + client_secret (OAuth).
import { type EdoProviderAdapter, notConfigured } from "./types";

function need(cfg: { client_id: string | null; client_secret: string | null }) {
  if (!cfg.client_id || !cfg.client_secret) return notConfigured("СБИС");
  return null;
}

export const sbisAdapter: EdoProviderAdapter = {
  provider: "sbis",
  title: "СБИС",
  async testConnection(cfg) { return need(cfg) ?? { ok: true }; },
  async getOrganizationInfo(cfg) { return need(cfg) ?? notConfigured("СБИС"); },
  async createEtrn(cfg) { return need(cfg) ?? notConfigured("СБИС"); },
  async getEtrnStatus(cfg) { return need(cfg) ?? notConfigured("СБИС"); },
  async sendForSignature(cfg) { return need(cfg) ?? notConfigured("СБИС"); },
  async signAsCarrier(cfg) { return need(cfg) ?? notConfigured("СБИС"); },
  async confirmDriverAction(cfg) { return need(cfg) ?? notConfigured("СБИС"); },
  async getIncomingDocuments(cfg) { return need(cfg) ?? notConfigured("СБИС"); },
  async downloadDocument(cfg) { return need(cfg) ?? notConfigured("СБИС"); },
  async cancelDocument(cfg) { return need(cfg) ?? notConfigured("СБИС"); },
  async closeDocument(cfg) { return need(cfg) ?? notConfigured("СБИС"); },
};
