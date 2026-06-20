// Единый интерфейс адаптера оператора ЭДО/ЭПД.
// Реальные операторы возвращают понятную ошибку "Оператор не настроен"
// если ключей нет. Внутренний mock реализует весь процесс локально.

export type EdoProvider =
  | "diadoc"
  | "sbis"
  | "taxcom"
  | "astral"
  | "sberkorus"
  | "other"
  | "internal_mock";

export interface EdoConnectionConfig {
  provider: EdoProvider;
  environment: "test" | "production";
  client_id: string | null;
  client_secret: string | null;
  api_key: string | null;
  access_token: string | null;
  refresh_token: string | null;
  certificate_id: string | null;
  external_org_id: string | null;
  box_id: string | null;
  organization_name: string | null;
  organization_inn: string | null;
}

export interface EdoResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
}

export interface EdoOrgInfo {
  external_org_id: string | null;
  organization_name: string | null;
  organization_inn: string | null;
}

export interface EdoEtrnDraft {
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
}

export interface EdoProviderAdapter {
  readonly provider: EdoProvider;
  readonly title: string;
  testConnection(cfg: EdoConnectionConfig): Promise<EdoResult>;
  getOrganizationInfo(cfg: EdoConnectionConfig): Promise<EdoResult<EdoOrgInfo>>;
  createEtrn(cfg: EdoConnectionConfig, draft: EdoEtrnDraft): Promise<EdoResult<{ external_id: string }>>;
  getEtrnStatus(cfg: EdoConnectionConfig, externalId: string): Promise<EdoResult<{ status: string }>>;
  sendForSignature(cfg: EdoConnectionConfig, externalId: string): Promise<EdoResult>;
  signAsCarrier(cfg: EdoConnectionConfig, externalId: string): Promise<EdoResult>;
  confirmDriverAction(cfg: EdoConnectionConfig, externalId: string, action: string): Promise<EdoResult>;
  getIncomingDocuments(cfg: EdoConnectionConfig): Promise<EdoResult<unknown[]>>;
  downloadDocument(cfg: EdoConnectionConfig, externalId: string): Promise<EdoResult<{ url: string }>>;
  cancelDocument(cfg: EdoConnectionConfig, externalId: string, reason: string): Promise<EdoResult>;
  closeDocument(cfg: EdoConnectionConfig, externalId: string): Promise<EdoResult>;
}

export function notConfigured(provider: string): EdoResult {
  return {
    ok: false,
    status: 501,
    error: `Оператор ${provider} не настроен. Заполните настройки подключения и обратитесь к администратору.`,
  };
}
