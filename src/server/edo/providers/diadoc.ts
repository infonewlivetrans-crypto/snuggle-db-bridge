// Контур Диадок — каркас адаптера. Реальные вызовы добавляются после
// получения api_key и регистрации приложения. Авторизация: api_key + token.
import { type EdoProviderAdapter, notConfigured } from "./types";

function requireKeys(cfg: { api_key: string | null; access_token: string | null }) {
  if (!cfg.api_key || !cfg.access_token) return notConfigured("Контур Диадок");
  return null;
}

export const diadocAdapter: EdoProviderAdapter = {
  provider: "diadoc",
  title: "Контур Диадок",
  async testConnection(cfg) {
    const err = requireKeys(cfg);
    if (err) return err;
    return { ok: true };
  },
  async getOrganizationInfo(cfg) {
    return requireKeys(cfg) ?? notConfigured("Контур Диадок");
  },
  async createEtrn(cfg) { return requireKeys(cfg) ?? notConfigured("Контур Диадок"); },
  async getEtrnStatus(cfg) { return requireKeys(cfg) ?? notConfigured("Контур Диадок"); },
  async sendForSignature(cfg) { return requireKeys(cfg) ?? notConfigured("Контур Диадок"); },
  async signAsCarrier(cfg) { return requireKeys(cfg) ?? notConfigured("Контур Диадок"); },
  async confirmDriverAction(cfg) { return requireKeys(cfg) ?? notConfigured("Контур Диадок"); },
  async getIncomingDocuments(cfg) { return requireKeys(cfg) ?? notConfigured("Контур Диадок"); },
  async downloadDocument(cfg) { return requireKeys(cfg) ?? notConfigured("Контур Диадок"); },
  async cancelDocument(cfg) { return requireKeys(cfg) ?? notConfigured("Контур Диадок"); },
  async closeDocument(cfg) { return requireKeys(cfg) ?? notConfigured("Контур Диадок"); },
};
