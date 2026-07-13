// Pure state machine для Full Scan (Checkpoint C, browser agent side).
// НЕ импортирует chrome.* / fetch — чтобы тестировать без Chrome API.
//
// Состояния:
//   idle              — задание не запущено
//   syncing_filters   — вызываем /full-scan/sync-filters
//   scanning          — активно читаем страницы ATI, шлём /full-scan/page
//   paused            — пользователь остановил
//   login_required    — ATI требует входа, не пытаемся логиниться
//   completing        — вызываем /full-scan/complete
//   completed         — успешно завершено
//   failed            — терминальная ошибка
//
// Инварианты:
// - только один активный taskId одновременно (см. reducer.taskId);
// - event с чужим taskId игнорируется (returns state unchanged + reason);
// - fingerprint сохраняется в state.filterFingerprint, чтобы UI/agent
//   могли сравнивать без обращения к серверу;
// - терминальные события всегда допускают ABORT для смены задания.

export const STATES = Object.freeze({
  IDLE: "idle",
  SYNCING_FILTERS: "syncing_filters",
  SCANNING: "scanning",
  PAUSED: "paused",
  LOGIN_REQUIRED: "login_required",
  COMPLETING: "completing",
  COMPLETED: "completed",
  FAILED: "failed",
});

export const EVENTS = Object.freeze({
  START: "START",                     // { taskId, fingerprint }
  SYNC_OK: "SYNC_OK",                 // { reset: bool }
  SYNC_FAIL: "SYNC_FAIL",             // { error }
  PAGE_OK: "PAGE_OK",                 // { pagesRead }
  PAGE_LOOP: "PAGE_LOOP",             // detected loop → completing(done)
  PAGE_MAX: "PAGE_MAX",               // reached max_pages → completing(done)
  PAGE_FAIL: "PAGE_FAIL",             // { error, retryable }
  PAUSE: "PAUSE",
  RESUME: "RESUME",
  LOGIN_REQUIRED: "LOGIN_REQUIRED",
  LOGIN_RESUMED: "LOGIN_RESUMED",
  COMPLETE_OK: "COMPLETE_OK",
  COMPLETE_FAIL: "COMPLETE_FAIL",     // { error }
  ABORT: "ABORT",                     // reset to idle (task change/logout)
});

export function initialState() {
  return {
    state: STATES.IDLE,
    taskId: null,
    filterFingerprint: null,
    pagesRead: 0,
    lastError: null,
    lastReason: null,
  };
}

/**
 * Восстановить состояние из статуса сервера (GET /full-scan/status).
 * @param {object} serverStatus — { status, pages_read, filter_fingerprint }
 * @param {string} taskId
 */
export function fromServerStatus(serverStatus, taskId) {
  const s = serverStatus || {};
  const map = {
    pending: STATES.IDLE,
    reset: STATES.IDLE,
    running: STATES.SCANNING,
    done: STATES.COMPLETED,
    failed: STATES.FAILED,
  };
  return {
    state: map[String(s.status)] ?? STATES.IDLE,
    taskId: taskId ?? null,
    filterFingerprint: s.filter_fingerprint ?? null,
    pagesRead: Number(s.pages_read ?? 0),
    lastError: s.error ?? null,
    lastReason: null,
  };
}

function ignore(state, reason) {
  return { ...state, lastReason: reason };
}

/**
 * Чистая функция перехода. Не бросает — всегда возвращает следующий state.
 */
export function transition(state, event, payload = {}) {
  const cur = state.state;
  const evTaskId = payload.taskId ?? null;
  // Enforce single active task: любой event с чужим taskId игнорируем,
  // кроме ABORT и START (START перезаписывает задание).
  if (
    evTaskId && state.taskId && evTaskId !== state.taskId
    && event.type !== EVENTS.ABORT && event.type !== EVENTS.START
  ) {
    return ignore(state, "task_id_mismatch");
  }

  switch (event.type) {
    case EVENTS.START: {
      const { taskId, fingerprint } = payload;
      if (!taskId) return ignore(state, "missing_task_id");
      // Нельзя запустить новое сканирование поверх активного, если taskId тот же и уже scanning.
      if (
        state.taskId === taskId
        && (cur === STATES.SCANNING || cur === STATES.SYNCING_FILTERS || cur === STATES.COMPLETING)
      ) {
        return ignore(state, "already_active");
      }
      // Другой taskId → сначала нужен ABORT; иначе не переходим.
      if (state.taskId && state.taskId !== taskId
          && cur !== STATES.IDLE && cur !== STATES.COMPLETED && cur !== STATES.FAILED) {
        return ignore(state, "another_task_active");
      }
      const preservedFp = state.taskId === taskId ? state.filterFingerprint : null;
      const preservedPages = state.taskId === taskId ? state.pagesRead : 0;
      return {
        state: STATES.SYNCING_FILTERS,
        taskId,
        filterFingerprint: fingerprint ?? preservedFp,
        pagesRead: preservedPages,
        lastError: null,
        lastReason: null,
      };
    }
    case EVENTS.SYNC_OK: {
      if (cur !== STATES.SYNCING_FILTERS) return ignore(state, "wrong_state_for_sync_ok");
      const reset = Boolean(payload.reset);
      return {
        ...state,
        state: STATES.SCANNING,
        pagesRead: reset ? 0 : state.pagesRead,
        lastReason: reset ? "filters_changed_reset" : "filters_unchanged",
      };
    }
    case EVENTS.SYNC_FAIL: {
      if (cur !== STATES.SYNCING_FILTERS) return ignore(state, "wrong_state_for_sync_fail");
      return { ...state, state: STATES.FAILED, lastError: payload.error ?? "sync_failed" };
    }
    case EVENTS.PAGE_OK: {
      if (cur !== STATES.SCANNING) return ignore(state, "not_scanning");
      return { ...state, pagesRead: Number(payload.pagesRead ?? state.pagesRead + 1), lastReason: "page_ok" };
    }
    case EVENTS.PAGE_LOOP:
    case EVENTS.PAGE_MAX: {
      if (cur !== STATES.SCANNING) return ignore(state, "not_scanning");
      return {
        ...state,
        state: STATES.COMPLETING,
        lastReason: event.type === EVENTS.PAGE_LOOP ? "loop_detected" : "max_pages",
      };
    }
    case EVENTS.PAGE_FAIL: {
      if (cur !== STATES.SCANNING) return ignore(state, "not_scanning");
      if (payload.retryable) return { ...state, lastReason: "page_retry", lastError: payload.error ?? null };
      return { ...state, state: STATES.FAILED, lastError: payload.error ?? "page_failed" };
    }
    case EVENTS.PAUSE: {
      if (cur === STATES.SCANNING || cur === STATES.SYNCING_FILTERS) {
        return { ...state, state: STATES.PAUSED, lastReason: "paused_by_user" };
      }
      return ignore(state, "cannot_pause");
    }
    case EVENTS.RESUME: {
      if (cur === STATES.PAUSED) return { ...state, state: STATES.SCANNING, lastReason: "resumed" };
      return ignore(state, "cannot_resume");
    }
    case EVENTS.LOGIN_REQUIRED: {
      if (cur === STATES.SCANNING || cur === STATES.SYNCING_FILTERS) {
        return { ...state, state: STATES.LOGIN_REQUIRED, lastReason: "ati_login_required" };
      }
      return ignore(state, "cannot_enter_login_required");
    }
    case EVENTS.LOGIN_RESUMED: {
      if (cur === STATES.LOGIN_REQUIRED) return { ...state, state: STATES.SCANNING, lastReason: "login_resumed" };
      return ignore(state, "cannot_resume_from_login");
    }
    case EVENTS.COMPLETE_OK: {
      if (cur !== STATES.COMPLETING && cur !== STATES.SCANNING) return ignore(state, "wrong_state_for_complete");
      return { ...state, state: STATES.COMPLETED, lastReason: state.lastReason ?? "complete_ok" };
    }
    case EVENTS.COMPLETE_FAIL: {
      return { ...state, state: STATES.FAILED, lastError: payload.error ?? "complete_failed" };
    }
    case EVENTS.ABORT: {
      return initialState();
    }
    default:
      return ignore(state, "unknown_event");
  }
}

/** Экспоненциальный backoff с ограничением попыток. */
export function computeBackoffMs(attempt, { baseMs = 500, maxMs = 8000 } = {}) {
  if (attempt <= 0) return 0;
  const v = Math.min(maxMs, baseMs * Math.pow(2, attempt - 1));
  return v;
}

export function isTerminal(state) {
  return state.state === STATES.COMPLETED || state.state === STATES.FAILED || state.state === STATES.IDLE;
}
