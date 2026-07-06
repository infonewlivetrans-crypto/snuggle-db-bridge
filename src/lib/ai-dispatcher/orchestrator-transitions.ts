// Pure orchestrator transition helpers.
// Client/server-safe. No side effects, no imports of Supabase.
// The server-side orchestrator can reuse these to compute the next step
// deterministically; тесты вызывают эти функции напрямую.

export type OrchestrationStatus =
  | "idle" | "checking_agent" | "creating_task" | "opening_ati"
  | "waiting_user_login" | "applying_filters" | "starting_search"
  | "waiting_results" | "reading_loads" | "scoring"
  | "searching" | "suitable_found" | "paused" | "failed" | "stopped";

export type SimpleStage = OrchestrationStatus;

export type CommandType =
  | "open_ati" | "apply_filters" | "start_search" | "read_visible_loads"
  | "refresh_page" | "focus_candidate" | "close_candidate_page";

export interface NextStep {
  commandType: CommandType;
  nextStatus: OrchestrationStatus;
  step: string;
  message: string;
}

const NEXT_BY_COMMAND: Partial<Record<CommandType, NextStep>> = {
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

/** Следующий шаг цепочки по успешно выполненной команде, либо null (терминальная). */
export function getNextOrchestrationStep(completedCommandType: CommandType): NextStep | null {
  return NEXT_BY_COMMAND[completedCommandType] ?? null;
}

/** Можно ли двигать цепочку дальше в данном статусе. */
export function canAdvanceOrchestration(status: OrchestrationStatus | null | undefined): boolean {
  if (!status) return false;
  return ![
    "paused", "stopped", "failed", "suitable_found", "waiting_user_login", "idle",
  ].includes(status);
}

/** Универсальный маппер ошибки команды → код оркестратора. */
export function mapCommandFailureToErrorCode(
  commandType: CommandType | string,
  errorMessage: string | null | undefined,
  cmdStatus: "failed" | "expired" | "cancelled" | string,
): string {
  if (cmdStatus === "expired") return "agent_timeout";
  const msg = String(errorMessage ?? "").toLowerCase();
  if (msg.includes("login")) return "ati_login_required";
  switch (commandType) {
    case "open_ati": return "open_ati_failed";
    case "apply_filters": return "filters_apply_failed";
    case "start_search": return "search_start_failed";
    case "read_visible_loads": return "extraction_failed";
    default: return "orchestration_failed";
  }
}

/** UI-безопасный mapping статуса на simple stage (никаких token/session). */
export function mapOrchestrationStatusToSimpleStage(
  status: OrchestrationStatus | null | undefined,
): SimpleStage {
  return (status ?? "idle") as SimpleStage;
}

/** Проверка: содержит ли произвольный объект чувствительные поля (для UI whitelist). */
export function containsSensitiveFields(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;
  const forbidden = ["token", "agent_token", "secret", "pairing_code", "cookie", "password", "authorization"];
  const json = JSON.stringify(obj).toLowerCase();
  return forbidden.some((f) => json.includes(f));
}

/** Нормализация интервала refresh — не чаще 60 секунд. */
export function normalizeRefreshIntervalSeconds(v: number | null | undefined): number {
  const n = Number(v ?? 60);
  if (!Number.isFinite(n) || n < 60) return 60;
  if (n > 3600) return 3600;
  return Math.floor(n);
}
