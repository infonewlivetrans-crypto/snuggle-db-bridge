// Mock-адаптер оператора ЭДО для нового контура отправки.
// Имитирует полный жизненный цикл документа: создание, отправка,
// доставка, подписание. Реальные внешние вызовы не выполняются.
import type {
  EdoOperatorAdapter,
  CreateDocumentResult,
  SendDocumentResult,
  DocumentStatusResult,
  CounterpartyCheckResult,
} from "./types";

function shortId(prefix: string): string {
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${rnd}`;
}

export const mockOperatorAdapter: EdoOperatorAdapter = {
  code: "internal_mock",
  title: "Внутренний mock-оператор Радиус Трек",

  async checkCounterpartyByInn(_cfg, inn) {
    const clean = (inn ?? "").trim();
    if (!/^\d{10}$|^\d{12}$/.test(clean)) {
      return { ok: false, error: "ИНН должен содержать 10 или 12 цифр" };
    }
    const result: CounterpartyCheckResult =
      clean[0] === "0"
        ? { found: false, message: "Контрагент не найден (mock)" }
        : {
            found: true,
            organization_name: `Mock-организация ${clean}`,
            edo_operator: "mock",
            participant_id: `MOCK-${clean}`,
            message: "Контрагент найден (mock)",
          };
    return { ok: true, data: result };
  },

  async createDocument(_cfg, _draft) {
    const data: CreateDocumentResult = {
      operator_document_id: shortId("MOCK-DOC"),
      operator_status: "mock_created",
    };
    return { ok: true, data };
  },

  async sendDocument(_cfg, operatorDocumentId) {
    const data: SendDocumentResult = {
      operator_document_id: operatorDocumentId || shortId("MOCK-DOC"),
      operator_status: "mock_sent",
      sent_at: new Date().toISOString(),
    };
    return { ok: true, data };
  },

  async getDocumentStatus(_cfg, _operatorDocumentId) {
    const data: DocumentStatusResult = {
      operator_status: "mock_sent",
      message: "Mock-статус не меняется автоматически",
    };
    return { ok: true, data };
  },

  async listIncomingDocuments() {
    return { ok: true, data: [] };
  },
};
