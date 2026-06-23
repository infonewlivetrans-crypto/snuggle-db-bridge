// Серверный API-клиент Saby. Не отправляет реальные запросы пока нет ключей.
// Маскирует секреты, валидирует настройки, готовит payload, возвращает понятные
// ошибки. ВНИМАНИЕ: никаких console.log с токенами/паролями/секретами.
import {
  SABY_METHODS,
  type SabyApiResult,
  type SabyConnectionSettings,
  type SabyIntegrationMode,
  type SabyMethodName,
} from "./saby-types";

const REQUIRED_FOR_API_READY: Array<keyof SabyConnectionSettings> = [
  "api_base_url",
  "app_client_id",
  "app_secret",
  "organization_id",
];

export function maskSecret(v: string | null | undefined): string {
  if (!v) return "—";
  if (v.length <= 4) return "••••";
  return `${v.slice(0, 2)}••••${v.slice(-2)}`;
}

export function resolveMode(s: SabyConnectionSettings): SabyIntegrationMode {
  return s.integration_mode ?? "mock";
}

export function validateForApiReady(s: SabyConnectionSettings): string[] {
  const missing: string[] = [];
  for (const k of REQUIRED_FOR_API_READY) {
    const v = s[k];
    if (v == null || (typeof v === "string" && !v.trim())) missing.push(k);
  }
  return missing;
}

export interface SabyCallContext {
  mode: SabyIntegrationMode;
  baseUrl: string | null;
  organizationId: string | null;
}

export function describeConnection(s: SabyConnectionSettings): Record<string, unknown> {
  return {
    mode: resolveMode(s),
    api_base_url: s.api_base_url ?? null,
    organization_id: s.organization_id ?? null,
    edo_box_id: s.edo_box_id ?? null,
    signing_mode: s.signing_mode ?? null,
    has_token: Boolean(s.token),
    has_app_secret: Boolean(s.app_secret),
    has_password: Boolean(s.password),
    has_certificate: Boolean(s.certificate_thumbprint),
    token_preview: maskSecret(s.token ?? null),
  };
}

/**
 * Унифицированный вызов метода Saby.
 * - mock: возвращает тестовый ответ;
 * - api_ready: валидирует настройки и формирует payload, но не отправляет наружу;
 * - live: пока заблокирован, реальные запросы не выполняются.
 */
export async function callSabyMethod<T = unknown>(
  settings: SabyConnectionSettings,
  method: SabyMethodName,
  params: Record<string, unknown>,
): Promise<SabyApiResult<T>> {
  const mode = resolveMode(settings);
  const sabyMethod = SABY_METHODS[method];

  if (mode === "mock") {
    return {
      ok: true,
      mode,
      data: {
        method: sabyMethod,
        echo: params,
        mock: true,
      } as unknown as T,
    };
  }

  if (mode === "api_ready") {
    const missing = validateForApiReady(settings);
    if (missing.length) {
      return {
        ok: false,
        mode,
        error: `Не хватает настроек Saby: ${missing.join(", ")}`,
        missing,
      };
    }
    // payload сформирован, но реальные запросы не отправляются.
    return {
      ok: true,
      mode,
      data: {
        method: sabyMethod,
        prepared_payload: params,
        sent: false,
        note: "api_ready: payload готов, реальные запросы отключены до подтверждения ключей",
      } as unknown as T,
    };
  }

  // live
  return {
    ok: false,
    mode,
    error: "Live-режим Saby ещё не подключён. Свяжитесь с администратором.",
  };
}
