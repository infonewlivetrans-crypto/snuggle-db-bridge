// Node/JS-mirror of src/lib/ai-dispatcher/orchestrator-transitions.ts
// Используется только для node:test в browser-agent/tests, чтобы не тянуть TS-runner.
// Логика ДОЛЖНА совпадать с TS-версией; изменения синхронно.
"use strict";

const NEXT_BY_COMMAND = {
  open_ati: {
    commandType: "apply_filters", nextStatus: "applying_filters",
    step: "apply_filters", message: "Заполняю параметры",
  },
  apply_filters: {
    commandType: "start_search", nextStatus: "starting_search",
    step: "start_search", message: "Запускаю поиск",
  },
  start_search: {
    commandType: "read_visible_loads", nextStatus: "waiting_results",
    step: "read_visible_loads", message: "Ожидаю результаты ATI",
  },
};

export function getNextOrchestrationStep(completedCommandType) {
  return NEXT_BY_COMMAND[completedCommandType] ?? null;
}
export function canAdvanceOrchestration(status) {
  if (!status) return false;
  return !["paused", "stopped", "failed", "suitable_found", "waiting_user_login", "idle"].includes(status);
}
export function mapCommandFailureToErrorCode(commandType, errorMessage, cmdStatus) {
  if (cmdStatus === "expired") return "agent_timeout";
  const msg = String(errorMessage ?? "").toLowerCase();
  if (msg.includes("login")) return "ati_login_required";
  if (commandType === "open_ati") return "open_ati_failed";
  if (commandType === "apply_filters") return "filters_apply_failed";
  if (commandType === "start_search") return "search_start_failed";
  if (commandType === "read_visible_loads") return "extraction_failed";
  return "orchestration_failed";
}
export function mapOrchestrationStatusToSimpleStage(status) {
  return status ?? "idle";
}
export function containsSensitiveFields(obj) {
  if (!obj || typeof obj !== "object") return false;
  const forbidden = ["token", "agent_token", "secret", "pairing_code", "cookie", "password", "authorization"];
  const json = JSON.stringify(obj).toLowerCase();
  return forbidden.some((f) => json.includes(f));
}
export function isTerminalOrchestrationStatus(status) {
  if (!status) return false;
  return ["failed", "stopped", "suitable_found"].includes(status);
}
export function isActiveOrchestrationStatus(status) {
  if (!status) return false;
  return [
    "checking_agent", "creating_task", "opening_ati",
    "applying_filters", "starting_search", "waiting_results",
    "reading_loads", "scoring", "searching",
  ].includes(status);
}
export function normalizeRefreshIntervalSeconds(v) {
  const n = Number(v ?? 60);
  if (!Number.isFinite(n) || n < 60) return 60;
  if (n > 3600) return 3600;
  return Math.floor(n);
}
