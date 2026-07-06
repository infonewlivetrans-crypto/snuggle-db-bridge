// Search Orchestrator — управляет автоматической цепочкой действий
// Browser Agent для одной задачи поиска (open_ati → apply_filters →
// start_search → read_visible_loads → scoring → searching/suitable_found).
//
// Правила:
// - Всё через RLS-клиент диспетчера. service_role не используется.
// - Следующая команда создаётся только после completed предыдущей.
// - orchestration_run_id защищает от событий старого запуска.
// - Дубликаты completed-callback не создают вторую команду
//   (проверяется по orchestration_current_command_id).
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { logAgentEvent, type AgentEventType } from "./mock-agent.server";
import {
  createAgentCommand, cancelAgentCommand,
} from "./agent-command.server";

type Client = SupabaseClient<Database>;
type AnyC = any;

export type OrchestrationStatus =
  | "idle" | "checking_agent" | "creating_task" | "opening_ati"
  | "waiting_user_login" | "applying_filters" | "starting_search"
  | "waiting_results" | "reading_loads" | "scoring"
  | "searching" | "suitable_found" | "paused" | "failed" | "stopped";

export type SimpleStage =
  | "checking_agent" | "creating_task" | "opening_ati"
  | "waiting_user_login" | "applying_filters" | "starting_search"
  | "waiting_results" | "reading_loads" | "scoring"
  | "searching" | "suitable_found" | "paused" | "failed" | "stopped" | "idle";

const STAGE_MSG: Record<SimpleStage, string> = {
  idle: "Готов к поиску",
  checking_agent: "Проверяю подключение агента",
  creating_task: "Подготавливаю задачу поиска",
  opening_ati: "Открываю ATI",
  waiting_user_login: "Войдите в ATI в открывшейся вкладке. После входа поиск продолжится автоматически",
  applying_filters: "Заполняю параметры поиска",
  starting_search: "Запускаю поиск",
  waiting_results: "Ожидаю результаты ATI",
  reading_loads: "Проверяю найденные грузы",
  scoring: "Оцениваю стоимость и прибыль",
  searching: "Ищу подходящие грузы",
  suitable_found: "Найдены подходящие грузы",
  paused: "Поиск приостановлен",
  failed: "Произошла ошибка",
  stopped: "Поиск остановлен",
};

export interface OrchestrationSafeStatus {
  task_id: string;
  orchestration_status: OrchestrationStatus | null;
  simple_stage: SimpleStage;
  message: string;
  error_code: string | null;
  error_message: string | null;
  started_at: string | null;
  updated_at: string | null;
  completed_at: string | null;
  can_retry: boolean;
  can_pause: boolean;
  can_stop: boolean;
  loads_seen_count: number;
  matched_count: number;
  next_refresh_at: string | null;
  current_step: string | null;
}

async function loadTask(client: Client, dispatcherId: string, taskId: string) {
  const c = client as AnyC;
  const { data } = await c
    .from("ai_dispatch_search_tasks")
    .select("*")
    .eq("id", taskId)
    .eq("dispatcher_id", dispatcherId)
    .maybeSingle();
  return data;
}

async function getActiveSession(
  client: Client, dispatcherId: string,
): Promise<{ id: string; last_heartbeat_at: string | null } | null> {
  const c = client as AnyC;
  const { data } = await c
    .from("ai_dispatch_agent_sessions")
    .select("id, last_heartbeat_at, status, revoked_at")
    .eq("dispatcher_id", dispatcherId)
    .is("revoked_at", null)
    .in("status", ["connected", "opening_site", "searching", "reading_page", "refreshing", "waiting_user_login"])
    .order("last_heartbeat_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

function isHeartbeatFresh(lastHb: string | null | undefined): boolean {
  if (!lastHb) return false;
  return Date.now() - new Date(lastHb).getTime() < 120_000; // 2 min
}

function buildOrchestrationPayload(
  task: any, runId: string, step: string, extra?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    orchestration_run_id: runId,
    orchestration_step: step,
    search_task_id: task.id,
    vehicle_params_json: task.vehicle_params_json ?? null,
    ati_filters_json: task.ati_filters_json ?? null,
    search_mode: task.search_mode,
    main_load_candidate_id: task.main_load_candidate_id ?? null,
    route_points_json: task.route_points_json ?? null,
    cargo_capacity_left_json: task.cargo_capacity_left_json ?? null,
    refresh_interval_seconds: task.refresh_interval_seconds ?? 60,
    target_total_price: task.target_total_price ?? null,
    target_price_per_km: task.target_price_per_km ?? null,
    target_net_profit: task.target_net_profit ?? null,
    ...extra,
  };
}

function pickErrorCodeFromCommand(cmd: any): string {
  const msg = String(cmd?.error_message ?? "").toLowerCase();
  if (msg.includes("login")) return "ati_login_required";
  if (cmd?.command_type === "open_ati") return "open_ati_failed";
  if (cmd?.command_type === "apply_filters") return "filters_apply_failed";
  if (cmd?.command_type === "start_search") return "search_start_failed";
  if (cmd?.command_type === "read_visible_loads") return "extraction_failed";
  return "orchestration_failed";
}

function isLoginRequiredResult(cmd: any): boolean {
  const r = cmd?.result_json;
  if (!r || typeof r !== "object") return false;
  const s = String(r.status ?? r.state ?? "").toLowerCase();
  return s === "ati_login_required" || s === "user_login_required" || s === "waiting_user_login" || r.needs_login === true;
}

async function updateTaskOrch(
  client: Client, dispatcherId: string, taskId: string, patch: Record<string, unknown>,
) {
  const c = client as AnyC;
  await c.from("ai_dispatch_search_tasks")
    .update({ ...patch, orchestration_updated_at: new Date().toISOString() })
    .eq("id", taskId).eq("dispatcher_id", dispatcherId);
}

async function logOrch(
  client: Client, dispatcherId: string, taskId: string,
  event: AgentEventType, message: string, payload: Record<string, unknown>,
) {
  await logAgentEvent(client, dispatcherId, taskId, null, event, message, payload);
}

// ─── Public API ──────────────────────────────────────────────────────────

export async function startSearchOrchestration(
  client: Client, dispatcherId: string, taskId: string,
): Promise<OrchestrationSafeStatus> {
  const task = await loadTask(client, dispatcherId, taskId);
  if (!task) throw new Error("task_not_found");
  if (["archived", "stopped", "confirmed"].includes(task.status)) {
    throw new Error("task_not_ready");
  }
  const hasVehicle = task.vehicle_source === "manual"
    ? task.manual_vehicle_json != null
    : task.vehicle_params_json != null;
  if (!hasVehicle) throw new Error("task_not_ready");
  if (!task.start_city && !task.destination_city) throw new Error("task_not_ready");

  // Если оркестрация уже активна — вернуть текущий статус, без дубля.
  const activeStatuses: OrchestrationStatus[] = [
    "checking_agent", "opening_ati", "waiting_user_login",
    "applying_filters", "starting_search", "waiting_results",
    "reading_loads", "scoring",
  ];
  if (task.orchestration_status && activeStatuses.includes(task.orchestration_status)) {
    return await getSearchOrchestrationStatus(client, dispatcherId, taskId);
  }

  const session = await getActiveSession(client, dispatcherId);
  if (!session) throw new Error("agent_not_connected");
  if (!isHeartbeatFresh(session.last_heartbeat_at)) throw new Error("agent_heartbeat_stale");

  const runId = crypto.randomUUID();
  await updateTaskOrch(client, dispatcherId, taskId, {
    orchestration_status: "checking_agent" as OrchestrationStatus,
    orchestration_run_id: runId,
    orchestration_current_command_id: null,
    orchestration_error_code: null,
    orchestration_error: null,
    orchestration_started_at: new Date().toISOString(),
    orchestration_completed_at: null,
  });
  await logOrch(client, dispatcherId, taskId, "orchestration_started",
    "Оркестратор запущен", { orchestration_run_id: runId });

  const commandId = await createAgentCommand(client, dispatcherId, {
    sessionId: session.id,
    commandType: "open_ati",
    searchTaskId: taskId,
    payload: buildOrchestrationPayload(task, runId, "open_ati"),
    expiresInSec: 120,
  });
  await updateTaskOrch(client, dispatcherId, taskId, {
    orchestration_status: "opening_ati" as OrchestrationStatus,
    orchestration_current_command_id: commandId,
  });
  await logOrch(client, dispatcherId, taskId, "orchestration_step_changed",
    "Открываю ATI", { next_status: "opening_ati", command_type: "open_ati" });

  return await getSearchOrchestrationStatus(client, dispatcherId, taskId);
}

/** Продвигает состояние: проверяет текущую команду и, если она completed/failed/expired/login-required, переключает шаг. Идемпотентна. */
export async function continueSearchOrchestration(
  client: Client, dispatcherId: string, taskId: string,
): Promise<OrchestrationSafeStatus> {
  const c = client as AnyC;
  let task = await loadTask(client, dispatcherId, taskId);
  if (!task) throw new Error("task_not_found");
  if (!task.orchestration_run_id) return await getSearchOrchestrationStatus(client, dispatcherId, taskId);
  if (["paused", "stopped", "failed"].includes(task.orchestration_status)) {
    return await getSearchOrchestrationStatus(client, dispatcherId, taskId);
  }

  // 1. Обнаружить ATI login detected → продолжить с apply_filters.
  if (task.orchestration_status === "waiting_user_login") {
    const { data: ev } = await c.from("ai_dispatch_agent_events")
      .select("id, event_type, created_at, payload_json")
      .eq("dispatcher_id", dispatcherId)
      .eq("search_task_id", taskId)
      .eq("event_type", "ati_login_detected")
      .order("created_at", { ascending: false })
      .limit(1).maybeSingle();
    if (ev && (!task.orchestration_started_at
        || new Date(ev.created_at).getTime() >= new Date(task.orchestration_started_at).getTime())) {
      return await resumeAfterAtiLogin(client, dispatcherId, taskId);
    }
    return await getSearchOrchestrationStatus(client, dispatcherId, taskId);
  }

  const cmdId = task.orchestration_current_command_id;
  if (!cmdId) return await getSearchOrchestrationStatus(client, dispatcherId, taskId);

  const { data: cmd } = await c.from("ai_dispatch_agent_commands")
    .select("*")
    .eq("id", cmdId)
    .eq("dispatcher_id", dispatcherId)
    .maybeSingle();
  if (!cmd) return await getSearchOrchestrationStatus(client, dispatcherId, taskId);

  // stale-guard: run_id в payload должен совпадать
  const cmdRun = (cmd.command_payload_json as any)?.orchestration_run_id;
  if (cmdRun && cmdRun !== task.orchestration_run_id) {
    await logOrch(client, dispatcherId, taskId, "orchestration_stale_event_ignored",
      "Игнорируем событие старого запуска", { command_id: cmdId });
    return await getSearchOrchestrationStatus(client, dispatcherId, taskId);
  }

  if (cmd.status === "queued" || cmd.status === "sent" || cmd.status === "acknowledged") {
    return await getSearchOrchestrationStatus(client, dispatcherId, taskId);
  }

  if (cmd.status === "expired") {
    return await failSearchOrchestration(client, dispatcherId, taskId,
      "agent_timeout", "Агент не ответил вовремя");
  }
  if (cmd.status === "failed") {
    // спец. случай: агент сообщает про login
    if (isLoginRequiredResult(cmd) || String(cmd.error_message ?? "").toLowerCase().includes("login")) {
      return await handleAtiLoginRequired(client, dispatcherId, taskId);
    }
    return await failSearchOrchestration(client, dispatcherId, taskId,
      pickErrorCodeFromCommand(cmd), cmd.error_message ?? "Команда не выполнена");
  }
  if (cmd.status === "cancelled") {
    // отменено пользователем через pause/stop — уже отражено в orchestration_status
    return await getSearchOrchestrationStatus(client, dispatcherId, taskId);
  }

  // status === completed
  if (isLoginRequiredResult(cmd)) {
    return await handleAtiLoginRequired(client, dispatcherId, taskId);
  }

  // Advance по типу команды. Проверяем что current_command_id ещё указывает на неё
  // (защита от дубля callback).
  task = await loadTask(client, dispatcherId, taskId);
  if (task.orchestration_current_command_id !== cmdId) {
    return await getSearchOrchestrationStatus(client, dispatcherId, taskId);
  }

  const session = await getActiveSession(client, dispatcherId);
  if (!session) {
    return await failSearchOrchestration(client, dispatcherId, taskId,
      "agent_not_connected", "Агент отключён");
  }

  const runId = task.orchestration_run_id;
  const nextByType: Record<string, { type: any; status: OrchestrationStatus; msg: string; step: string }> = {
    open_ati: { type: "apply_filters", status: "applying_filters", msg: "Заполняю параметры", step: "apply_filters" },
    apply_filters: { type: "start_search", status: "starting_search", msg: "Запускаю поиск", step: "start_search" },
    start_search: { type: "read_visible_loads", status: "waiting_results", msg: "Ожидаю результаты ATI", step: "read_visible_loads" },
  };
  const next = nextByType[cmd.command_type];
  if (next) {
    const commandId = await createAgentCommand(client, dispatcherId, {
      sessionId: session.id,
      commandType: next.type,
      searchTaskId: taskId,
      payload: buildOrchestrationPayload(task, runId, next.step),
      expiresInSec: 120,
    });
    await updateTaskOrch(client, dispatcherId, taskId, {
      orchestration_status: next.status,
      orchestration_current_command_id: commandId,
    });
    await logOrch(client, dispatcherId, taskId, "orchestration_step_changed",
      next.msg, { previous_status: task.orchestration_status, next_status: next.status, command_type: next.type });
    return await getSearchOrchestrationStatus(client, dispatcherId, taskId);
  }

  if (cmd.command_type === "read_visible_loads") {
    // read_visible_loads завершён → scoring уже выполнен внутри /loads.
    // Определяем: есть ли подходящие кандидаты.
    const { data: rows } = await c.from("ai_dispatch_load_candidates")
      .select("id, status, match_score")
      .eq("search_task_id", taskId)
      .in("status", ["suitable", "high_match", "new"])
      .order("match_score", { ascending: false, nullsFirst: false })
      .limit(50);
    const suitable = (rows ?? []).filter((r: any) => r.status === "suitable" || r.status === "high_match" || (r.match_score ?? 0) >= 60);
    const nextStatus: OrchestrationStatus = suitable.length > 0 ? "suitable_found" : "searching";
    await updateTaskOrch(client, dispatcherId, taskId, {
      orchestration_status: nextStatus,
      orchestration_current_command_id: null,
      orchestration_completed_at: new Date().toISOString(),
    });
    await logOrch(client, dispatcherId, taskId, "orchestration_completed_initial_cycle",
      "Начальный цикл завершён", { next_status: nextStatus, suitable_count: suitable.length });
    return await getSearchOrchestrationStatus(client, dispatcherId, taskId);
  }

  return await getSearchOrchestrationStatus(client, dispatcherId, taskId);
}

export async function handleAtiLoginRequired(
  client: Client, dispatcherId: string, taskId: string,
): Promise<OrchestrationSafeStatus> {
  await updateTaskOrch(client, dispatcherId, taskId, {
    orchestration_status: "waiting_user_login" as OrchestrationStatus,
    orchestration_error_code: null,
    orchestration_error: null,
  });
  await logOrch(client, dispatcherId, taskId, "orchestration_waiting_user_login",
    "Ожидаю вход в ATI", {});
  return await getSearchOrchestrationStatus(client, dispatcherId, taskId);
}

export async function resumeAfterAtiLogin(
  client: Client, dispatcherId: string, taskId: string,
): Promise<OrchestrationSafeStatus> {
  const task = await loadTask(client, dispatcherId, taskId);
  if (!task || task.orchestration_status !== "waiting_user_login") {
    return await getSearchOrchestrationStatus(client, dispatcherId, taskId);
  }
  const session = await getActiveSession(client, dispatcherId);
  if (!session) throw new Error("agent_not_connected");
  const runId = task.orchestration_run_id;
  const commandId = await createAgentCommand(client, dispatcherId, {
    sessionId: session.id,
    commandType: "apply_filters",
    searchTaskId: taskId,
    payload: buildOrchestrationPayload(task, runId, "apply_filters"),
    expiresInSec: 120,
  });
  await updateTaskOrch(client, dispatcherId, taskId, {
    orchestration_status: "applying_filters" as OrchestrationStatus,
    orchestration_current_command_id: commandId,
  });
  await logOrch(client, dispatcherId, taskId, "orchestration_resumed_after_login",
    "Продолжаю после входа в ATI", { next_status: "applying_filters" });
  return await getSearchOrchestrationStatus(client, dispatcherId, taskId);
}

export async function retrySearchOrchestration(
  client: Client, dispatcherId: string, taskId: string,
): Promise<OrchestrationSafeStatus> {
  const c = client as AnyC;
  const task = await loadTask(client, dispatcherId, taskId);
  if (!task) throw new Error("task_not_found");
  await c.from("ai_dispatch_search_tasks")
    .update({
      orchestration_status: null,
      orchestration_current_command_id: null,
      orchestration_error_code: null,
      orchestration_error: null,
      orchestration_retry_count: (task.orchestration_retry_count ?? 0) + 1,
    })
    .eq("id", taskId).eq("dispatcher_id", dispatcherId);
  await logOrch(client, dispatcherId, taskId, "orchestration_retried",
    "Повтор запуска", { retry_count: (task.orchestration_retry_count ?? 0) + 1 });
  return await startSearchOrchestration(client, dispatcherId, taskId);
}

export async function pauseSearchOrchestration(
  client: Client, dispatcherId: string, taskId: string,
): Promise<OrchestrationSafeStatus> {
  await updateTaskOrch(client, dispatcherId, taskId, {
    orchestration_status: "paused" as OrchestrationStatus,
    auto_refresh_enabled: false,
  });
  await logOrch(client, dispatcherId, taskId, "orchestration_paused",
    "Поиск приостановлен", {});
  return await getSearchOrchestrationStatus(client, dispatcherId, taskId);
}

export async function stopSearchOrchestration(
  client: Client, dispatcherId: string, taskId: string,
): Promise<OrchestrationSafeStatus> {
  const c = client as AnyC;
  // Отменяем queued/sent команды задачи
  const { data: pending } = await c.from("ai_dispatch_agent_commands")
    .select("id")
    .eq("dispatcher_id", dispatcherId)
    .eq("search_task_id", taskId)
    .in("status", ["queued", "sent"]);
  for (const row of pending ?? []) {
    await cancelAgentCommand(client, dispatcherId, row.id);
  }
  await updateTaskOrch(client, dispatcherId, taskId, {
    orchestration_status: "stopped" as OrchestrationStatus,
    orchestration_current_command_id: null,
    auto_refresh_enabled: false,
    status: "stopped",
  });
  await logOrch(client, dispatcherId, taskId, "orchestration_stopped",
    "Поиск остановлен", { cancelled: (pending ?? []).length });
  return await getSearchOrchestrationStatus(client, dispatcherId, taskId);
}

export async function failSearchOrchestration(
  client: Client, dispatcherId: string, taskId: string,
  errorCode: string, errorMessage: string,
): Promise<OrchestrationSafeStatus> {
  await updateTaskOrch(client, dispatcherId, taskId, {
    orchestration_status: "failed" as OrchestrationStatus,
    orchestration_error_code: errorCode,
    orchestration_error: errorMessage,
    orchestration_completed_at: new Date().toISOString(),
  });
  await logOrch(client, dispatcherId, taskId,
    errorCode === "agent_timeout" ? "orchestration_timed_out" : "orchestration_failed",
    errorMessage, { error_code: errorCode });
  return await getSearchOrchestrationStatus(client, dispatcherId, taskId);
}

export async function getSearchOrchestrationStatus(
  client: Client, dispatcherId: string, taskId: string,
): Promise<OrchestrationSafeStatus> {
  const task = await loadTask(client, dispatcherId, taskId);
  if (!task) throw new Error("task_not_found");
  const status = (task.orchestration_status ?? "idle") as OrchestrationStatus;
  const simple: SimpleStage = status;
  const message = status === "failed"
    ? (task.orchestration_error ?? STAGE_MSG.failed)
    : STAGE_MSG[simple] ?? STAGE_MSG.idle;
  return {
    task_id: task.id,
    orchestration_status: task.orchestration_status ?? null,
    simple_stage: simple,
    message,
    error_code: task.orchestration_error_code ?? null,
    error_message: task.orchestration_error ?? null,
    started_at: task.orchestration_started_at ?? null,
    updated_at: task.orchestration_updated_at ?? null,
    completed_at: task.orchestration_completed_at ?? null,
    can_retry: ["failed", "stopped"].includes(status),
    can_pause: ["searching", "suitable_found", "waiting_results", "opening_ati", "applying_filters", "starting_search", "reading_loads", "scoring"].includes(status),
    can_stop: !["stopped", "idle"].includes(status),
    loads_seen_count: task.loads_seen_count ?? 0,
    matched_count: task.matched_count ?? 0,
    next_refresh_at: task.next_refresh_at ?? null,
    current_step: task.orchestration_status ?? null,
  };
}
