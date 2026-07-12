// Полный первичный просмотр ATI (Checkpoint B, фаза 2).
// Только серверный слой: атомарные переходы + подсчёт страниц.
// Никакого service_role — работаем через anon-клиент; агент-токен уже
// проверен в вызывающем маршруте, dispatcherId используется как гарантия
// владения задачей.
import { makeAnonClient } from "@/server/api-helpers.server";

export interface RecordPageResult {
  ok: boolean;
  reason?: "loop_detected" | "max_pages" | "not_found" | "forbidden" | "not_running";
  pages_read?: number;
}

export interface ScanStatus {
  found: boolean;
  status?: string;
  pages_read?: number;
  filter_fingerprint?: string | null;
  last_seen_page_fingerprint?: string | null;
  pagination_max_pages?: number;
  started_at?: string | null;
  completed_at?: string | null;
  error?: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function anyClient(): any {
  return makeAnonClient();
}

async function loadTask(taskId: string) {
  const c = anyClient();
  const { data, error } = await c
    .from("ai_dispatch_search_tasks")
    .select(
      "id, dispatcher_id, filter_fingerprint, initial_scan_status, initial_scan_pages_read, last_seen_page_fingerprint, pagination_max_pages, initial_scan_started_at, initial_scan_completed_at, initial_scan_error",
    )
    .eq("id", taskId)
    .maybeSingle();
  if (error || !data) return null;
  return data as {
    id: string;
    dispatcher_id: string;
    filter_fingerprint: string | null;
    initial_scan_status: string;
    initial_scan_pages_read: number;
    last_seen_page_fingerprint: string | null;
    pagination_max_pages: number;
    initial_scan_started_at: string | null;
    initial_scan_completed_at: string | null;
    initial_scan_error: string | null;
  };
}

/**
 * Синхронизировать отпечаток фильтров с задачей. Если он изменился, RPC
 * сбрасывает счётчики полного просмотра. Возвращает {reset, previous, new}.
 */
export async function syncFilterFingerprint(
  taskId: string,
  dispatcherId: string,
  fingerprint: string,
): Promise<{ ok: boolean; reset?: boolean; previous?: string | null; error?: string }> {
  const task = await loadTask(taskId);
  if (!task) return { ok: false, error: "not_found" };
  if (task.dispatcher_id !== dispatcherId) return { ok: false, error: "forbidden" };
  const c = anyClient();
  const { data, error } = await c.rpc("agent_reset_initial_scan_if_filters_changed", {
    _task_id: taskId,
    _fingerprint: fingerprint,
  });
  if (error) return { ok: false, error: error.message };
  const row = (data ?? {}) as { reset?: boolean; previous_fingerprint?: string | null };
  return { ok: true, reset: Boolean(row.reset), previous: row.previous_fingerprint ?? null };
}

/**
 * Пометить старт первичного полного просмотра.
 * Идемпотентно: если уже running/done, ничего не меняет.
 */
export async function beginInitialScan(
  taskId: string,
  dispatcherId: string,
): Promise<{ ok: boolean; status?: string; error?: string }> {
  const task = await loadTask(taskId);
  if (!task) return { ok: false, error: "not_found" };
  if (task.dispatcher_id !== dispatcherId) return { ok: false, error: "forbidden" };
  if (task.initial_scan_status === "running" || task.initial_scan_status === "done") {
    return { ok: true, status: task.initial_scan_status };
  }
  const c = anyClient();
  const { error } = await c
    .from("ai_dispatch_search_tasks")
    .update({
      initial_scan_status: "running",
      initial_scan_started_at: new Date().toISOString(),
      initial_scan_error: null,
    })
    .eq("id", taskId)
    .in("initial_scan_status", ["pending", "reset", "failed"]);
  if (error) return { ok: false, error: error.message };
  return { ok: true, status: "running" };
}

/**
 * Записать факт прочтения страницы. Использует last_seen_page_fingerprint
 * для детекта петли и pagination_max_pages как жёсткий верхний предел.
 * НЕ пишет самих кандидатов — за это отвечает существующий /loads endpoint.
 */
export async function recordScanPage(
  taskId: string,
  dispatcherId: string,
  pageFingerprint: string,
): Promise<RecordPageResult> {
  const task = await loadTask(taskId);
  if (!task) return { ok: false, reason: "not_found" };
  if (task.dispatcher_id !== dispatcherId) return { ok: false, reason: "forbidden" };
  if (task.initial_scan_status !== "running") {
    return { ok: false, reason: "not_running", pages_read: task.initial_scan_pages_read };
  }
  // Дубликат последней страницы — вероятная петля пагинации.
  if (task.last_seen_page_fingerprint && task.last_seen_page_fingerprint === pageFingerprint) {
    return { ok: false, reason: "loop_detected", pages_read: task.initial_scan_pages_read };
  }
  const nextPages = task.initial_scan_pages_read + 1;
  if (nextPages > task.pagination_max_pages) {
    return { ok: false, reason: "max_pages", pages_read: task.initial_scan_pages_read };
  }
  const c = anyClient();
  const { error } = await c
    .from("ai_dispatch_search_tasks")
    .update({
      initial_scan_pages_read: nextPages,
      last_seen_page_fingerprint: pageFingerprint,
    })
    .eq("id", taskId);
  if (error) return { ok: false, reason: "not_found" };
  return { ok: true, pages_read: nextPages };
}

export async function completeInitialScan(
  taskId: string,
  dispatcherId: string,
  finalStatus: "done" | "failed" = "done",
  errorText?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const task = await loadTask(taskId);
  if (!task) return { ok: false, error: "not_found" };
  if (task.dispatcher_id !== dispatcherId) return { ok: false, error: "forbidden" };
  const c = anyClient();
  const { error } = await c
    .from("ai_dispatch_search_tasks")
    .update({
      initial_scan_status: finalStatus,
      initial_scan_completed_at: new Date().toISOString(),
      initial_scan_error: finalStatus === "failed" ? (errorText ?? "unknown") : null,
    })
    .eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function getScanStatus(
  taskId: string,
  dispatcherId: string,
): Promise<ScanStatus> {
  const task = await loadTask(taskId);
  if (!task) return { found: false };
  if (task.dispatcher_id !== dispatcherId) return { found: false };
  return {
    found: true,
    status: task.initial_scan_status,
    pages_read: task.initial_scan_pages_read,
    filter_fingerprint: task.filter_fingerprint,
    last_seen_page_fingerprint: task.last_seen_page_fingerprint,
    pagination_max_pages: task.pagination_max_pages,
    started_at: task.initial_scan_started_at,
    completed_at: task.initial_scan_completed_at,
    error: task.initial_scan_error,
  };
}

export interface RejectionPatch {
  rejection_reason: string;
  rejection_details?: unknown;
  rating_negative?: boolean;
  rating_reasons?: unknown;
}

/**
 * Пометить кандидата как отклонённого с причиной. Проверяет владение
 * через связку candidate → task → dispatcher.
 */
export async function markCandidateRejected(
  candidateId: string,
  dispatcherId: string,
  patch: RejectionPatch,
): Promise<{ ok: boolean; error?: string }> {
  const c = anyClient();
  const { data: cand, error: e1 } = await c
    .from("ai_dispatch_load_candidates")
    .select("id, search_task_id")
    .eq("id", candidateId)
    .maybeSingle();
  if (e1 || !cand) return { ok: false, error: "not_found" };
  const { data: task, error: e2 } = await c
    .from("ai_dispatch_search_tasks")
    .select("dispatcher_id")
    .eq("id", cand.search_task_id)
    .maybeSingle();
  if (e2 || !task || task.dispatcher_id !== dispatcherId) {
    return { ok: false, error: "forbidden" };
  }
  const updates: Record<string, unknown> = {
    rejection_reason: patch.rejection_reason,
    rejection_details: patch.rejection_details ?? null,
  };
  if (patch.rating_negative !== undefined) updates.rating_negative = patch.rating_negative;
  if (patch.rating_reasons !== undefined) updates.rating_reasons = patch.rating_reasons;
  const { error: e3 } = await c
    .from("ai_dispatch_load_candidates")
    .update(updates)
    .eq("id", candidateId);
  if (e3) return { ok: false, error: e3.message };
  return { ok: true };
}
