// Калуга Астрал — каркас адаптера. Авторизация: client_id + client_secret + token.
import { type EdoProviderAdapter, notConfigured } from "./types";

function need(cfg: { client_id: string | null; client_secret: string | null }) {
  if (!cfg.client_id || !cfg.client_secret) return notConfigured("Калуга Астрал");
  return null;
}

export const astralAdapter: EdoProviderAdapter = {
  provider: "astral",
  title: "Калуга Астрал",
  async testConnection(cfg) { return need(cfg) ?? { ok: true }; },
  async getOrganizationInfo(cfg) { return need(cfg) ?? notConfigured("Калуга Астрал"); },
  async createEtrn(cfg) { return need(cfg) ?? notConfigured("Калуга Астрал"); },
  async getEtrnStatus(cfg) { return need(cfg) ?? notConfigured("Калуга Астрал"); },
  async sendForSignature(cfg) { return need(cfg) ?? notConfigured("Калуга Астрал"); },
  async signAsCarrier(cfg) { return need(cfg) ?? notConfigured("Калуга Астрал"); },
  async confirmDriverAction(cfg) { return need(cfg) ?? notConfigured("Калуга Астрал"); },
  async getIncomingDocuments(cfg) { return need(cfg) ?? notConfigured("Калуга Астрал"); },
  async downloadDocument(cfg) { return need(cfg) ?? notConfigured("Калуга Астрал"); },
  async cancelDocument(cfg) { return need(cfg) ?? notConfigured("Калуга Астрал"); },
  async closeDocument(cfg) { return need(cfg) ?? notConfigured("Калуга Астрал"); },
};
