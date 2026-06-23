// Типы и enum-литералы для Saby TMS интеграции. Изолированы от UI.

export type SabyIntegrationMode = "mock" | "api_ready" | "live";
export type SabySigningMode = "goskey" | "certificate" | "manual_link";

export interface SabyConnectionSettings {
  api_base_url?: string | null;
  login?: string | null;
  password?: string | null;
  app_client_id?: string | null;
  app_secret?: string | null;
  token?: string | null;
  refresh_token?: string | null;
  organization_id?: string | null;
  edo_box_id?: string | null;
  certificate_thumbprint?: string | null;
  signing_mode?: SabySigningMode | null;
  integration_mode?: SabyIntegrationMode | null;
}

export interface SabyDocumentDraft {
  document_type: string;
  doc_number?: string | null;
  shipper?: SabyParty | null;
  consignee?: SabyParty | null;
  carrier?: SabyParty | null;
  forwarder?: SabyParty | null;
  driver?: SabyDriver | null;
  vehicle?: SabyVehicle | null;
  route?: SabyRoute | null;
  cargo?: SabyCargo | null;
  rate?: SabyRate | null;
  meta?: Record<string, unknown> | null;
}

export interface SabyParty {
  name?: string | null;
  inn?: string | null;
  kpp?: string | null;
  address?: string | null;
  contact?: string | null;
}

export interface SabyDriver {
  full_name?: string | null;
  phone?: string | null;
  license_number?: string | null;
}

export interface SabyVehicle {
  plate?: string | null;
  brand?: string | null;
  model?: string | null;
  trailer_plate?: string | null;
}

export interface SabyRoute {
  loading_address?: string | null;
  unloading_address?: string | null;
  loading_at?: string | null;
  unloading_at?: string | null;
}

export interface SabyCargo {
  description?: string | null;
  weight_kg?: number | null;
  volume_m3?: number | null;
  places?: number | null;
}

export interface SabyRate {
  amount?: number | null;
  currency?: string | null;
  terms?: string | null;
}

export interface SabyParticipantLinks {
  sender_link?: string | null;
  shipper_link?: string | null;
  carrier_link?: string | null;
  driver_link?: string | null;
  consignee_link?: string | null;
  forwarder_link?: string | null;
  customer_link?: string | null;
}

export interface SabyApiResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  missing?: string[];
  mode?: SabyIntegrationMode;
}

// Карта методов Saby (русские имена СБИС хранятся ТОЛЬКО здесь).
export const SABY_METHODS = {
  writeDocument: "СБИС.ЗаписатьДокумент",
  generateAttachment: "СБИС.СгенерироватьВложение",
  prepareAction: "СБИС.ПодготовитьДействие",
  executeAction: "СБИС.ВыполнитьДействие",
  writeAttachment: "СБИС.ЗаписатьВложение",
  getChanges: "СБИС.СписокИзменений",
  readDocument: "СБИС.ПрочитатьДокумент",
  getFlkErrors: "ESD.GetFLCDoc",
  getMintransIds: "sabyESD.GetMintransIds",
} as const;

export type SabyMethodName = keyof typeof SABY_METHODS;
