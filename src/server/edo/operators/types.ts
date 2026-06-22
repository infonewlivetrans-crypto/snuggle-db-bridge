// Единый интерфейс адаптера оператора ЭДО для нового контура отправки.
// Реальные операторы (СБИС, Диадок, Такском, Астрал) подключаются
// отдельными файлами в этой папке без изменения UI/основного слоя.

export type OperatorCode =
  | "internal_mock"
  | "diadoc"
  | "sbis"
  | "taxcom"
  | "astral"
  | "sberkorus"
  | "other";

export interface OperatorConfig {
  code: OperatorCode;
  environment?: "test" | "production";
  client_id?: string | null;
  client_secret?: string | null;
  api_key?: string | null;
  access_token?: string | null;
  certificate_id?: string | null;
  external_org_id?: string | null;
  box_id?: string | null;
  organization_name?: string | null;
  organization_inn?: string | null;
}

export interface OperatorResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface CounterpartyCheckResult {
  found: boolean;
  organization_name?: string | null;
  edo_operator?: string | null;
  participant_id?: string | null;
  message?: string;
}

export interface CreateDocumentDraft {
  document_type: string;
  doc_number?: string | null;
  shipper_name?: string | null;
  shipper_inn?: string | null;
  consignee_name?: string | null;
  consignee_inn?: string | null;
  route_summary?: string | null;
  cargo_summary?: string | null;
  vehicle_label?: string | null;
  driver_label?: string | null;
  loading_at?: string | null;
  unloading_at?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface CreateDocumentResult {
  operator_document_id: string;
  operator_status: string;
}

export interface SendDocumentResult {
  operator_document_id: string;
  operator_status: string;
  sent_at: string;
}

export interface DocumentStatusResult {
  operator_status: string;
  delivered_at?: string | null;
  signed_at?: string | null;
  rejected_at?: string | null;
  message?: string | null;
}

export interface IncomingDocument {
  operator_document_id: string;
  document_type: string;
  shipper_name?: string | null;
  shipper_inn?: string | null;
}

export interface EdoOperatorAdapter {
  readonly code: OperatorCode;
  readonly title: string;

  checkCounterpartyByInn(
    cfg: OperatorConfig,
    inn: string,
  ): Promise<OperatorResult<CounterpartyCheckResult>>;

  createDocument(
    cfg: OperatorConfig,
    draft: CreateDocumentDraft,
  ): Promise<OperatorResult<CreateDocumentResult>>;

  sendDocument(
    cfg: OperatorConfig,
    operatorDocumentId: string,
  ): Promise<OperatorResult<SendDocumentResult>>;

  getDocumentStatus(
    cfg: OperatorConfig,
    operatorDocumentId: string,
  ): Promise<OperatorResult<DocumentStatusResult>>;

  listIncomingDocuments(
    cfg: OperatorConfig,
  ): Promise<OperatorResult<IncomingDocument[]>>;
}

export function operatorNotConfigured<T = unknown>(code: string): OperatorResult<T> {
  return {
    ok: false,
    error: `Оператор ${code} ещё не подключён. Свяжитесь с администратором для настройки.`,
  };
}
