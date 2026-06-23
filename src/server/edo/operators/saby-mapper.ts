// Преобразование документа Радиус Трек в payload Saby (без отправки наружу).
import type { SabyDocumentDraft, SabyParticipantLinks } from "./saby-types";

export function buildSabyDocumentPayload(
  draft: SabyDocumentDraft,
): Record<string, unknown> {
  return {
    Документ: {
      Тип: draft.document_type,
      Номер: draft.doc_number ?? null,
      Грузоотправитель: draft.shipper ?? null,
      Грузополучатель: draft.consignee ?? null,
      Перевозчик: draft.carrier ?? null,
      Экспедитор: draft.forwarder ?? null,
      Водитель: draft.driver ?? null,
      Транспорт: draft.vehicle ?? null,
      Маршрут: draft.route ?? null,
      Груз: draft.cargo ?? null,
      Ставка: draft.rate ?? null,
      Доп: draft.meta ?? null,
    },
  };
}

export function buildMockParticipantLinks(documentId: string): SabyParticipantLinks {
  const base = `https://saby.mock/etrn/${documentId}`;
  return {
    sender_link: `${base}?role=sender`,
    shipper_link: `${base}?role=shipper`,
    carrier_link: `${base}?role=carrier`,
    driver_link: `${base}?role=driver`,
    consignee_link: `${base}?role=consignee`,
    forwarder_link: `${base}?role=forwarder`,
    customer_link: `${base}?role=customer`,
  };
}
