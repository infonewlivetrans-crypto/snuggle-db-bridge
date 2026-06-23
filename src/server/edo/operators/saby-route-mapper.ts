// Маппинг данных рейса/документа Радиус Трек в SabyDocumentDraft.
// Если данных не хватает — возвращает список недостающих полей,
// но НЕ бросает исключение.
import type { SabyDocumentDraft } from "./saby-types";

export interface RadiusDocLike {
  document_type?: string | null;
  doc_number?: string | null;
  shipper_name?: string | null;
  shipper_inn?: string | null;
  consignee_name?: string | null;
  consignee_inn?: string | null;
  vehicle_label?: string | null;
  driver_label?: string | null;
  route_summary?: string | null;
  loading_city?: string | null;
  unloading_city?: string | null;
  loading_at?: string | null;
  unloading_at?: string | null;
  cargo_summary?: string | null;
  rate_amount?: number | null;
  rate_currency?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface MapResult {
  draft: SabyDocumentDraft;
  missing: string[];
}

const REQUIRED_FOR_ETRN: Array<{ key: keyof RadiusDocLike; label: string }> = [
  { key: "shipper_name", label: "Грузоотправитель" },
  { key: "shipper_inn", label: "ИНН грузоотправителя" },
  { key: "consignee_name", label: "Грузополучатель" },
  { key: "consignee_inn", label: "ИНН грузополучателя" },
  { key: "driver_label", label: "Водитель" },
  { key: "vehicle_label", label: "Транспорт" },
  { key: "loading_city", label: "Город погрузки" },
  { key: "unloading_city", label: "Город выгрузки" },
  { key: "loading_at", label: "Дата погрузки" },
  { key: "cargo_summary", label: "Описание груза" },
];

export function mapRadiusDocToSaby(doc: RadiusDocLike): MapResult {
  const docType = doc.document_type ?? "etrn";
  const missing: string[] = [];
  if (docType === "etrn") {
    for (const f of REQUIRED_FOR_ETRN) {
      const v = doc[f.key];
      if (v == null || (typeof v === "string" && !v.trim())) missing.push(f.label);
    }
  }

  const draft: SabyDocumentDraft = {
    document_type: docType,
    doc_number: doc.doc_number ?? null,
    shipper: {
      name: doc.shipper_name ?? null,
      inn: doc.shipper_inn ?? null,
    },
    consignee: {
      name: doc.consignee_name ?? null,
      inn: doc.consignee_inn ?? null,
    },
    driver: { full_name: doc.driver_label ?? null },
    vehicle: { plate: doc.vehicle_label ?? null },
    route: {
      loading_address: doc.loading_city ?? null,
      unloading_address: doc.unloading_city ?? null,
      loading_at: doc.loading_at ?? null,
      unloading_at: doc.unloading_at ?? null,
    },
    cargo: { description: doc.cargo_summary ?? null },
    rate: {
      amount: doc.rate_amount ?? null,
      currency: doc.rate_currency ?? "RUB",
    },
    meta: doc.meta ?? null,
  };
  return { draft, missing };
}
