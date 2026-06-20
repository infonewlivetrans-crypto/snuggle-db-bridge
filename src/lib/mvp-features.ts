// MVP feature flags для постепенного включения функций.
//
// Значения читаются из system_settings через SettingsProvider (useSetting).
// Если записи в БД нет — используется значение по умолчанию (false).
// Это позволяет временно скрыть/отключить незавершённые блоки без удаления
// кода и без миграций. Включать каждую функцию можно вручную, добавив
// запись в system_settings с тем же ключом и значением true.

import { useSetting } from "@/lib/settings-provider";

export const MVP_FEATURE_KEYS = {
  driverTripExecution: "dispatcher.features.driver_trip_execution_enabled",
  documentSignature: "dispatcher.features.document_signature_enabled",
  carrierEmailAdvanced: "dispatcher.features.carrier_email_advanced_settings_enabled",
  driverFullRouteWorkflow: "dispatcher.features.driver_full_route_workflow_enabled",
  edoModule: "dispatcher.features.edo_module_enabled",
  edoRealOperator: "dispatcher.features.edo_real_operator_enabled",
  edoMock: "dispatcher.features.edo_mock_enabled",
} as const;

function asBool(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true" || v === "1";
  if (typeof v === "number") return v !== 0;
  return fallback;
}

/** Полный сценарий выполнения рейса водителем (этапы, фото, статусы по точкам). */
export function useDriverTripExecutionEnabled(): boolean {
  return asBool(useSetting<unknown>(MVP_FEATURE_KEYS.driverTripExecution, false));
}

/** Подпись/печать заявок и документов. */
export function useDocumentSignatureEnabled(): boolean {
  return asBool(useSetting<unknown>(MVP_FEATURE_KEYS.documentSignature, false));
}

/** Сложные настройки IMAP/SMTP в кабинете перевозчика. */
export function useCarrierEmailAdvancedEnabled(): boolean {
  return asBool(useSetting<unknown>(MVP_FEATURE_KEYS.carrierEmailAdvanced, false));
}

/** Полный маршрутный workflow водителя (точки, документы, события). */
export function useDriverFullRouteWorkflowEnabled(): boolean {
  return asBool(useSetting<unknown>(MVP_FEATURE_KEYS.driverFullRouteWorkflow, false));
}
