import { z } from "zod";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api-client";

// =============== Constants ===============

export const DOCUMENT_OWNER_TYPES = ["carrier", "driver", "vehicle", "freight", "deal"] as const;
export type DocumentOwnerType = (typeof DOCUMENT_OWNER_TYPES)[number];

export const DOCUMENT_STATUSES = [
  "uploaded",
  "checking",
  "approved",
  "rejected",
  "expired",
  "archived",
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  uploaded: "Загружен",
  checking: "На проверке",
  approved: "Одобрен",
  rejected: "Отклонён",
  expired: "Просрочен",
  archived: "В архиве",
};

export const CARRIER_DOC_TYPES = [
  "company_card",
  "inn",
  "ogrn",
  "bank_details",
  "passport",
  "self_employed_certificate",
  "contract",
  "carrier_stamp_image",
  "carrier_signature_image",
  "other",
] as const;

export const DRIVER_DOC_TYPES = [
  "passport",
  "driver_license",
  "medical_certificate",
  "photo",
  "other",
] as const;

export const VEHICLE_DOC_TYPES = [
  "sts",
  "pts",
  "osago",
  "vehicle_photo",
  "diagnostic_card",
  "other",
] as const;

export const FREIGHT_DOC_TYPES = [
  "customer_request_pdf",
  "customer_contract_pdf",
  "customer_specification",
  "customer_invoice",
  "customer_attachment",
  "email_attachment",
  "signed_request_pdf",
  "loading_photo",
  "unloading_photo",
  "cargo_photo",
  "delivery_proof",
  "transport_document",
  "signed_ttn",
  "act_or_upd",
  "payment_document",
  "other_trip_document",
  "other",
] as const;

export const DEAL_DOC_TYPES = [
  "loading_photo",
  "unloading_photo",
  "cargo_photo",
  "delivery_proof",
  "transport_document",
  "signed_ttn",
  "act_or_upd",
  "payment_document",
  "customer_request_pdf",
  "customer_contract_pdf",
  "customer_specification",
  "customer_invoice",
  "customer_attachment",
  "signed_request_pdf",
  "other_trip_document",
  "other",
] as const;

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  company_card: "Карточка предприятия / реквизиты",
  inn: "ИНН",
  ogrn: "ОГРН/ОГРНИП",
  bank_details: "Банковские реквизиты",
  passport: "Паспорт",
  self_employed_certificate: "Документ самозанятого",
  contract: "Договор",
  carrier_stamp_image: "Печать перевозчика",
  carrier_signature_image: "Подпись перевозчика",
  driver_license: "Водительское удостоверение",
  medical_certificate: "Медицинская справка",
  photo: "Фото",
  sts: "СТС",
  pts: "ПТС",
  osago: "ОСАГО",
  vehicle_photo: "Фото машины",
  diagnostic_card: "Диагностическая карта",
  customer_request_pdf: "PDF-заявка заказчика",
  customer_contract_pdf: "Договор от заказчика",
  customer_specification: "Спецификация",
  customer_invoice: "Счёт",
  customer_attachment: "Другое вложение заказчика",
  email_attachment: "Вложение письма",
  signed_request_pdf: "Подписанная заявка (PDF)",
  other: "Другое",
};

export function documentTypesFor(ownerType: DocumentOwnerType): readonly string[] {
  if (ownerType === "carrier") return CARRIER_DOC_TYPES;
  if (ownerType === "driver") return DRIVER_DOC_TYPES;
  if (ownerType === "freight") return FREIGHT_DOC_TYPES;
  if (ownerType === "deal") return DEAL_DOC_TYPES;
  return VEHICLE_DOC_TYPES;
}

// =============== Types ===============

export interface DocumentDTO {
  id: string;
  owner_type: DocumentOwnerType;
  owner_id: string;
  document_type: string;
  title: string | null;
  file_path: string | null;
  file_name: string | null;
  file_mime: string | null;
  file_size: number | null;
  document_status: DocumentStatus;
  comment: string | null;
  uploaded_by_type: string | null;
  uploaded_at: string;
  checked_by: string | null;
  checked_at: string | null;
  created_at: string;
  updated_at: string;
}

// =============== Schemas ===============

const nullableText = (max = 1000) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v == null || v === "" ? null : v));

export const documentCreateSchema = z.object({
  owner_type: z.enum(DOCUMENT_OWNER_TYPES),
  owner_id: z.string().uuid(),
  document_type: z.string().trim().min(1).max(64),
  title: nullableText(255),
  file_path: nullableText(1024),
  file_name: nullableText(255),
  file_mime: nullableText(255),
  file_size: z.number().int().nonnegative().optional().nullable(),
  comment: nullableText(2000),
  document_status: z.enum(DOCUMENT_STATUSES).optional().default("uploaded"),
});
export type DocumentCreateInput = z.input<typeof documentCreateSchema>;

export const documentUpdateSchema = z.object({
  document_status: z.enum(DOCUMENT_STATUSES).optional(),
  comment: nullableText(2000),
  title: nullableText(255),
});
export type DocumentUpdateInput = z.input<typeof documentUpdateSchema>;

// =============== API client ===============

function qs(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "" || v === "all") continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export interface ListDocumentsParams {
  owner_type?: DocumentOwnerType;
  owner_id?: string;
  document_type?: string;
  document_status?: DocumentStatus | "all";
  limit?: number;
  offset?: number;
}

export const documentsApi = {
  list: (params: ListDocumentsParams = {}) =>
    apiGet<{ rows: DocumentDTO[]; total: number }>(
      `/api/dispatcher/documents${qs(params as Record<string, unknown>)}`,
      { auth: true },
    ),
  create: (body: DocumentCreateInput) =>
    apiPost<{ row: DocumentDTO }>("/api/dispatcher/documents", body),
  update: (id: string, body: DocumentUpdateInput) =>
    apiPatch<{ row: DocumentDTO }>(`/api/dispatcher/documents/${id}`, body),
  archive: (id: string) =>
    apiDelete<{ ok: true }>(`/api/dispatcher/documents/${id}`),
  uploadFile: (form: FormData) =>
    apiPost<{
      file_path: string;
      file_name: string;
      file_mime: string;
      file_size: number;
    }>("/api/dispatcher/documents/upload", form),
  downloadUrl: (id: string) => `/api/dispatcher/documents/${id}/download`,
};

export const carrierDocumentsApi = {
  uploadFile: (form: FormData) =>
    apiPost<{
      file_path: string;
      file_name: string;
      file_mime: string;
      file_size: number;
    }>("/api/carrier/documents/upload", form),
};

