// Заглушка для "Другого оператора". Всегда возвращает "не настроен".
import { type EdoProviderAdapter, notConfigured } from "./types";

export const otherAdapter: EdoProviderAdapter = {
  provider: "other",
  title: "Другой оператор",
  async testConnection() { return notConfigured("Другой оператор"); },
  async getOrganizationInfo() { return notConfigured("Другой оператор"); },
  async createEtrn() { return notConfigured("Другой оператор"); },
  async getEtrnStatus() { return notConfigured("Другой оператор"); },
  async sendForSignature() { return notConfigured("Другой оператор"); },
  async signAsCarrier() { return notConfigured("Другой оператор"); },
  async confirmDriverAction() { return notConfigured("Другой оператор"); },
  async getIncomingDocuments() { return notConfigured("Другой оператор"); },
  async downloadDocument() { return notConfigured("Другой оператор"); },
  async cancelDocument() { return notConfigured("Другой оператор"); },
  async closeDocument() { return notConfigured("Другой оператор"); },
};
