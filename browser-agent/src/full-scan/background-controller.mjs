// Full Scan background controller.
// Единственный владелец Full Scan runtime в background service worker.
//
// Инварианты (см. подблок C/фаза B):
//   - только один активный taskId одновременно;
//   - последовательная отправка страниц (mutex), никаких параллельных submitPage;
//   - complete вызывается один раз (терминальное состояние блокирует повтор);
//   - запоздалый ответ старого taskId игнорируется;
//   - при stop() выставляется AbortController и снапшот сбрасывается;
//   - в snapshot НЕТ agent token, паролей ATI, Supabase-креденшлов, service_role.
//
// Пишем чистый JS (.mjs), чтобы тестировать через `node --test` без сборки TS.
// TypeScript-обёртка объявлена в background-controller.d.mts.

import {
  initialState, transition, fromServerStatus,
  STATES, EVENTS,
} from "../shared/full-scan-state.mjs";
import { computePageFingerprint } from "../shared/full-scan-retry.mjs";

const SNAPSHOT_KEY_DEFAULT = "rt_full_scan_v1";

function emptySnapshot() {
  return {
    taskId: null,
    state: STATES.IDLE,
    filterFingerprint: null,
    pagesRead: 0,
    lastPageFingerprint: null,
    nextExpectedPage: 1,
    updatedAt: new Date(0).toISOString(),
    lastErrorCode: null,
    dispatcherId: null,
    sessionId: null,
  };
}

function safeErrorCode(e) {
  const s = String((e && e.message) || e || "error");
  // Оставляем короткий код без URL/тел ответов/токенов.
  const m = s.match(/http_\d+|[a-z][a-z0-9_]{2,31}/i);
  return m ? m[0].toLowerCase().slice(0, 40) : "error";
}

const FORBIDDEN_SNAPSHOT_KEYS = [
  "token", "agent_token", "password", "cookie",
  "authorization", "service_role", "supabase_key", "secret",
];

function assertNoSecrets(snapshot) {
  for (const k of Object.keys(snapshot || {})) {
    const lk = k.toLowerCase();
    for (const bad of FORBIDDEN_SNAPSHOT_KEYS) {
      if (lk.includes(bad)) {
        throw new Error(`snapshot_contains_secret_key:${k}`);
      }
    }
  }
}

export class FullScanBackgroundController {
  /**
   * @param {object} deps
   * @param {object} deps.api          — { syncFilters, begin, submitPage, complete, getStatus }
   * @param {object} deps.storage      — { read(): snap|null, write(snap): void }
   * @param {() => string} [deps.now]
   */
  constructor(deps) {
    this.api = deps.api;
    this.storage = deps.storage;
    this.now = deps.now || (() => new Date().toISOString());
    this._state = initialState();
    this._snapshot = emptySnapshot();
    this._chain = Promise.resolve();
    this._abort = null;
    this._restored = false;
  }

  getState() { return { ...this._state }; }
  getSnapshot() { return { ...this._snapshot }; }

  _ensureAbort() {
    if (!this._abort) this._abort = new AbortController();
    return this._abort.signal;
  }

  async _persist() {
    this._snapshot.updatedAt = this.now();
    assertNoSecrets(this._snapshot);
    await this.storage.write(this._snapshot);
  }

  _syncSnapshotFromState() {
    this._snapshot.taskId = this._state.taskId;
    this._snapshot.state = this._state.state;
    this._snapshot.pagesRead = this._state.pagesRead;
    this._snapshot.filterFingerprint = this._state.filterFingerprint;
    if (this._state.lastError) this._snapshot.lastErrorCode = this._state.lastError;
    this._snapshot.nextExpectedPage = this._state.pagesRead + 1;
  }

  // Все операции — через один mutex-цепочку, чтобы не было параллельных submitPage/complete.
  _run(fn) {
    const next = this._chain.then(fn, fn);
    // Не «падаем» цепочку из-за throw в fn — оборачиваем в catch.
    this._chain = next.catch(() => undefined);
    return next;
  }

  async restore() {
    if (this._restored) return;
    this._restored = true;
    const snap = await this.storage.read().catch(() => null);
    if (!snap || !snap.taskId) return;
    this._snapshot = { ...emptySnapshot(), ...snap };
    // Терминальные состояния — не дёргаем сервер, оставляем как есть.
    if (snap.state === STATES.COMPLETED || snap.state === STATES.FAILED || snap.state === STATES.IDLE) {
      this._state = {
        ...initialState(),
        state: snap.state,
        taskId: snap.taskId,
        filterFingerprint: snap.filterFingerprint ?? null,
        pagesRead: Number(snap.pagesRead || 0),
      };
      return;
    }
    // Активное задание — один запрос статуса.
    try {
      const status = await this.api.getStatus(snap.taskId);
      if (status && status.found !== false) {
        this._state = fromServerStatus({
          status: status.status,
          pages_read: status.pages_read,
          filter_fingerprint: status.filter_fingerprint,
          error: status.error,
        }, snap.taskId);
        this._syncSnapshotFromState();
        await this._persist();
      }
    } catch {
      // Офлайн — оставляем локальный snapshot; повторный begin не делаем.
    }
  }

  /**
   * Старт/пере-синхронизация: sync-filters + begin.
   * @returns {{ reset: boolean, state: string }}
   */
  startOrSyncFilters(taskId, fingerprint, identity) {
    return this._run(async () => {
      if (!taskId) throw new Error("missing_task_id");
      const cur = this._state;
      const busy =
        cur.taskId && cur.taskId !== taskId &&
        cur.state !== STATES.IDLE && cur.state !== STATES.COMPLETED && cur.state !== STATES.FAILED;
      if (busy) throw new Error("another_task_active");

      // Свежая цепочка отмены на новую сессию.
      if (this._abort) { this._abort.abort(); }
      this._abort = new AbortController();
      const signal = this._abort.signal;

      // Если taskId сменился — start новый.
      if (cur.taskId !== taskId) {
        this._state = transition(initialState(), { type: EVENTS.START }, { taskId, fingerprint });
      } else {
        // Тот же taskId — start только если не в активной фазе (idempotent restart).
        const s = transition(this._state, { type: EVENTS.START }, { taskId, fingerprint });
        if (s.state === STATES.SYNCING_FILTERS) this._state = s;
        else this._state = { ...this._state, filterFingerprint: fingerprint };
      }

      if (identity) {
        this._snapshot.dispatcherId = identity.dispatcherId ?? this._snapshot.dispatcherId ?? null;
        this._snapshot.sessionId = identity.sessionId ?? this._snapshot.sessionId ?? null;
      }

      let reset = false;
      try {
        const r = await this.api.syncFilters(taskId, fingerprint, signal);
        reset = Boolean(r && r.reset);
        this._state = transition(this._state, { type: EVENTS.SYNC_OK }, { taskId, reset });
      } catch (e) {
        this._state = transition(this._state, { type: EVENTS.SYNC_FAIL }, { taskId, error: safeErrorCode(e) });
        this._snapshot.lastErrorCode = safeErrorCode(e);
        this._syncSnapshotFromState();
        await this._persist();
        throw e;
      }

      try {
        await this.api.begin(taskId, signal);
      } catch (e) {
        // begin — idempotent, оставляем состояние scanning; отметим код ошибки.
        this._snapshot.lastErrorCode = safeErrorCode(e);
      }

      this._syncSnapshotFromState();
      await this._persist();
      return { reset, state: this._state.state };
    });
  }

  /**
   * Отправка одной страницы (обязательно после startOrSyncFilters).
   * Возвращает { ok, reason?, pagesRead?, completed }.
   * completed=true если сервер сообщил loop_detected / max_pages и мы завершили.
   */
  submitPage(taskId, pageUrl, textHashes) {
    return this._run(async () => {
      if (!taskId) return { ok: false, reason: "missing_task_id", completed: false };
      if (this._state.taskId && this._state.taskId !== taskId) {
        return { ok: false, reason: "task_id_mismatch", completed: false };
      }
      if (this._state.state === STATES.COMPLETED || this._state.state === STATES.FAILED) {
        return { ok: false, reason: "already_terminal", completed: true };
      }
      if (this._state.state !== STATES.SCANNING) {
        return { ok: false, reason: "not_started", completed: false };
      }
      const signal = this._ensureAbort();
      const fp = computePageFingerprint(pageUrl, textHashes);
      let r;
      try {
        r = await this.api.submitPage(taskId, fp, signal);
      } catch (e) {
        this._state = transition(this._state, { type: EVENTS.PAGE_FAIL },
          { taskId, error: safeErrorCode(e), retryable: true });
        this._snapshot.lastErrorCode = safeErrorCode(e);
        this._syncSnapshotFromState();
        await this._persist();
        return { ok: false, reason: safeErrorCode(e), completed: false };
      }
      // Игнорируем ответы, если пока ждали отмена/смена задания.
      if (this._state.taskId !== taskId) {
        return { ok: false, reason: "task_id_mismatch", completed: false };
      }
      if (r && r.ok) {
        this._state = transition(this._state, { type: EVENTS.PAGE_OK },
          { taskId, pagesRead: r.pages_read ?? (this._state.pagesRead + 1) });
        this._snapshot.lastPageFingerprint = fp;
        this._syncSnapshotFromState();
        await this._persist();
        return { ok: true, pagesRead: this._state.pagesRead, completed: false };
      }
      const reason = (r && r.reason) || "page_failed";
      if (reason === "loop_detected" || reason === "max_pages") {
        this._state = transition(this._state, {
          type: reason === "loop_detected" ? EVENTS.PAGE_LOOP : EVENTS.PAGE_MAX,
        }, { taskId });
        this._syncSnapshotFromState();
        // Автозавершение — один раз.
        await this._completeInternal(taskId, "done", undefined, signal);
        return { ok: false, reason, pagesRead: r && r.pages_read, completed: true };
      }
      this._state = transition(this._state, { type: EVENTS.PAGE_FAIL },
        { taskId, error: reason, retryable: false });
      this._snapshot.lastErrorCode = reason;
      this._syncSnapshotFromState();
      await this._persist();
      return { ok: false, reason, completed: false };
    });
  }

  async _completeInternal(taskId, status, error, signal) {
    if (this._state.state === STATES.COMPLETED || this._state.state === STATES.FAILED) return;
    try {
      await this.api.complete(taskId, status, error, signal);
      this._state = transition(this._state, {
        type: status === "done" ? EVENTS.COMPLETE_OK : EVENTS.COMPLETE_FAIL,
      }, { taskId, error });
    } catch (e) {
      this._snapshot.lastErrorCode = safeErrorCode(e);
    }
    this._syncSnapshotFromState();
    await this._persist();
  }

  completeTask(taskId, status = "done", error) {
    return this._run(async () => {
      if (this._state.taskId !== taskId) return;
      const signal = this._ensureAbort();
      await this._completeInternal(taskId, status, error, signal);
    });
  }

  stop(reason) {
    return this._run(async () => {
      if (this._abort) { try { this._abort.abort(); } catch { /* noop */ } this._abort = null; }
      this._state = initialState();
      const prev = this._snapshot;
      this._snapshot = {
        ...emptySnapshot(),
        dispatcherId: prev.dispatcherId,
        sessionId: prev.sessionId,
        lastErrorCode: reason || null,
      };
      await this._persist();
    });
  }
}

// ---- chrome.storage.local adapter (safe wrapper без секретов) ----
export function createChromeSnapshotStorage(key = SNAPSHOT_KEY_DEFAULT) {
  return {
    async read() {
      return new Promise((resolve) => {
        try {
          // eslint-disable-next-line no-undef
          chrome.storage.local.get([key], (v) => {
            const raw = v && v[key];
            if (!raw) return resolve(null);
            try { resolve(JSON.parse(String(raw))); } catch { resolve(null); }
          });
        } catch { resolve(null); }
      });
    },
    async write(snap) {
      assertNoSecrets(snap || {});
      return new Promise((resolve) => {
        try {
          // eslint-disable-next-line no-undef
          chrome.storage.local.set(
            { [key]: snap ? JSON.stringify(snap) : "" }, () => resolve(),
          );
        } catch { resolve(); }
      });
    },
  };
}

export const _internal = { safeErrorCode, assertNoSecrets, emptySnapshot };
