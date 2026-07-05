// Простые русскоязычные сообщения об ошибках Browser Agent.
// Никаких stack trace, RPC/SQL-имён и внутренних кодов.

export type SimpleAgentErrorCode =
  | "extension_not_found"
  | "extension_timeout"
  | "agent_disconnected"
  | "agent_token_expired"
  | "origin_not_allowed"
  | "ati_login_required"
  | "ati_open_failed"
  | "filters_apply_failed"
  | "search_form_not_detected"
  | "extraction_failed"
  | "command_timeout"
  | "unknown";

const MAP: Record<SimpleAgentErrorCode, string> = {
  extension_not_found: "Расширение Radius Track Agent не установлено",
  extension_timeout: "Расширение не отвечает",
  agent_disconnected: "Агент не подключён",
  agent_token_expired: "Подключение истекло. Подключите агент снова",
  origin_not_allowed: "Этот адрес Радиус Трек не разрешён в настройках агента",
  ati_login_required: "Войдите в ATI в открывшейся вкладке",
  ati_open_failed: "Не удалось открыть ATI",
  filters_apply_failed: "Не удалось заполнить параметры поиска",
  search_form_not_detected: "Не удалось распознать форму поиска ATI",
  extraction_failed: "Не удалось прочитать список грузов",
  command_timeout: "Агент не ответил вовремя",
  unknown: "Не удалось выполнить действие",
};

export function getSimpleAgentErrorMessage(
  code: string | null | undefined,
  fallback?: string,
): string {
  if (code && code in MAP) return MAP[code as SimpleAgentErrorCode];
  return fallback ?? MAP.unknown;
}
