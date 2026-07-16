// Radius Track Browser Agent — background service worker.
// Никакого API ATI. Хранит agent token в chrome.storage.local и общается
// только с /api/public/agent/ai-dispatcher/* endpoints Радиус Трек.
import {
  AGENT_VERSION, AGENT_PROTOCOL_VERSION, ATI_SELECTOR_CONFIG_VERSION,
  BUILD_CHANNEL, BUILD_DATE,
} from "./version";
import { BUILD_INFO, buildLoadedPayload } from "./build-info";
import { sanitizeAgentDiagnostics } from "./sanitize";
import {
  scheduleTaskRefresh, cancelTaskRefresh, restoreActiveSearchSchedules,
  lockTaskRefresh, unlockTaskRefresh, getScheduledTasks, parseAlarmName,
} from "./search-scheduler";
import {
  shouldRunScheduledRefresh, shouldStopScheduler, shouldRunMissingLogic,
  normalizeRefreshIntervalSeconds,
} from "./shared/scheduler-state.mjs";
import { computeFilterFingerprint } from "./shared/filter-fingerprint.mjs";
import { FullScanApi } from "./full-scan/api";
import {
  FullScanBackgroundController, createChromeSnapshotStorage,
} from "./full-scan/background-controller.mjs";

// ---- Full Scan runtime (единственный владелец) ----
// fetchImpl читает baseUrl+token из chrome.storage каждый запрос,
// чтобы rotate/disconnect подхватывались сразу и токен не попадал в snapshot.
const fullScanFetch = async (path: string, init: RequestInit): Promise<Response> => {
  const s = await readStorage();
  if (!s[STORAGE_KEYS.baseUrl]) throw new Error("base_url_not_set");
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined ?? {}),
  };
  if (s[STORAGE_KEYS.token]) headers.Authorization = `Bearer ${s[STORAGE_KEYS.token]}`;
  return fetch(`${s[STORAGE_KEYS.baseUrl]}${path}`, { ...init, headers });
};
const fullScanApi = new FullScanApi({ fetchImpl: fullScanFetch });
const fullScan = new FullScanBackgroundController({
  api: fullScanApi,
  storage: createChromeSnapshotStorage(),
});

const STORAGE_KEYS = {
  baseUrl: "rt_base_url",
  token: "rt_agent_token",
  sessionId: "rt_session_id",
  lastHeartbeat: "rt_last_heartbeat",
  lastError: "rt_last_error",
  currentTaskId: "rt_current_task_id",
  lastVisibleCount: "rt_last_visible_count",
  lastSentCount: "rt_last_sent_count",
  lastSuitableCount: "rt_last_suitable_count",
  lastReadAt: "rt_last_read_at",
  waitingLogin: "rt_waiting_login_tasks_v1",
  nextRefreshAt: "rt_next_refresh_at",
} as const;

type Storage = Partial<Record<(typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS], string>>;

async function readStorage(): Promise<Storage> {
  const keys = Object.values(STORAGE_KEYS);
  return new Promise((resolve) => chrome.storage.local.get(keys, (v) => resolve(v as Storage)));
}
async function writeStorage(patch: Storage): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.set(patch, () => resolve()));
}

// ---------- Waiting login state ----------
interface WaitingLoginTask {
  searchTaskId: string;
  orchestrationRunId: string | null;
  managedTabId: number | null;
  waitingSince: string;
  lastAuthState: string;
  loginDetectedSent: boolean;
  createdByAgent: boolean;
}
async function readWaitingLogin(): Promise<Record<string, WaitingLoginTask>> {
  return new Promise((r) => chrome.storage.local.get([STORAGE_KEYS.waitingLogin], (v) => {
    const raw = v?.[STORAGE_KEYS.waitingLogin];
    try { return r(raw ? JSON.parse(String(raw)) : {}); } catch { return r({}); }
  }));
}
async function writeWaitingLogin(map: Record<string, WaitingLoginTask>): Promise<void> {
  return new Promise((r) => chrome.storage.local.set(
    { [STORAGE_KEYS.waitingLogin]: JSON.stringify(map) }, () => r(),
  ));
}
async function upsertWaitingLogin(t: WaitingLoginTask): Promise<void> {
  const m = await readWaitingLogin(); m[t.searchTaskId] = t; await writeWaitingLogin(m);
}
async function removeWaitingLogin(taskId: string): Promise<void> {
  const m = await readWaitingLogin(); delete m[taskId]; await writeWaitingLogin(m);
}


async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const s = await readStorage();
  if (!s[STORAGE_KEYS.baseUrl]) throw new Error("base_url_not_set");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (s[STORAGE_KEYS.token]) headers.Authorization = `Bearer ${s[STORAGE_KEYS.token]}`;
  const res = await fetch(`${s[STORAGE_KEYS.baseUrl]}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`);
  return res.json() as Promise<T>;
}

async function findAtiTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await new Promise<chrome.tabs.Tab[]>((r) =>
    chrome.tabs.query({ url: ATI_HOST_MATCH_PATTERNS as unknown as string[] }, (t) => r(t)),
  );
  return tabs.find((t) => t.active) ?? tabs[0] ?? null;
}

async function sendToContent<T = unknown>(tabId: number, message: unknown): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (resp) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const err = (chrome as any).runtime?.lastError;
        if (err) return resolve(null);
        resolve((resp ?? null) as T);
      });
    } catch { resolve(null); }
  });
}

async function heartbeat(): Promise<void> {
  const tabs = await new Promise<chrome.tabs.Tab[]>((r) =>
    chrome.tabs.query({ url: ATI_HOST_MATCH_PATTERNS as unknown as string[] }, (t) => r(t)),
  );
  try {
    await api("/api/public/agent/ai-dispatcher/heartbeat", {
      method: "POST",
      body: JSON.stringify({
        agent_version: AGENT_VERSION,
        protocol_version: AGENT_PROTOCOL_VERSION,
        selector_config_version: ATI_SELECTOR_CONFIG_VERSION,
        build_channel: BUILD_CHANNEL,
        build_date: BUILD_DATE,
        browser_name: "Chrome",
        active_tab_count: tabs.length,
        status: "connected",
        last_action: "heartbeat",
      }),
    });
    await writeStorage({ [STORAGE_KEYS.lastHeartbeat]: new Date().toISOString(), [STORAGE_KEYS.lastError]: "" });
  } catch (e) {
    await writeStorage({ [STORAGE_KEYS.lastError]: String((e as Error).message ?? e) });
  }
}

interface AgentCommand {
  id: string;
  command_type: string;
  command_payload_json?: Record<string, unknown>;
  search_task_id?: string | null;
  candidate_id?: string | null;
}

async function pollCommands(): Promise<AgentCommand[]> {
  try {
    const res = await api<{ commands: AgentCommand[] }>(
      "/api/public/agent/ai-dispatcher/commands/poll",
    );
    return res.commands ?? [];
  } catch { return []; }
}

async function ack(id: string) {
  await api(`/api/public/agent/ai-dispatcher/commands/${id}/ack`, { method: "POST", body: "{}" });
}
async function complete(id: string, result: Record<string, unknown>) {
  await api(`/api/public/agent/ai-dispatcher/commands/${id}/complete`, {
    method: "POST", body: JSON.stringify({ result_json: result }),
  });
}
async function fail(id: string, error: string, outcome: "failed" | "expired" | "cancelled" | "login_required" = "failed") {
  await api(`/api/public/agent/ai-dispatcher/commands/${id}/fail`, {
    method: "POST", body: JSON.stringify({ error_message: error, outcome }),
  });
}

// ---------- Auth check ----------
type AuthStatus = "authenticated" | "login_required" | "unknown";
async function checkAtiAuth(tabId: number): Promise<AuthStatus> {
  const res = await sendToContent<{ ok?: boolean; status?: AuthStatus }>(
    tabId, { type: "RT_DETECT_ATI_AUTH" },
  );
  const s = res?.status;
  if (s === "authenticated" || s === "login_required" || s === "unknown") return s;
  return "unknown";
}

const AUTH_REQUIRED_COMMANDS = new Set([
  "apply_filters", "start_search", "read_visible_loads", "refresh_page",
]);

async function getSchedulerStatus(taskId: string): Promise<{
  active?: boolean; task_status?: string; orchestration_status?: string;
  auto_refresh_enabled?: boolean; refresh_interval_seconds?: number;
  should_stop_scheduler?: boolean; search_mode?: string;
} | null> {
  try {
    return await api(`/api/public/agent/ai-dispatcher/tasks/${encodeURIComponent(taskId)}/scheduler-status`);
  } catch { return null; }
}

interface LoadsResp {
  ok?: boolean;
  suitable_count?: number;
  best_candidate_id?: string | null;
  created?: Array<{ candidate_id: string; source_row_index: number | null; source_external_ref: string | null; text_hash: string | null; match_score: number | null; status: string | null; ai_warnings: unknown }>;
  updated?: Array<LoadsResp["created"] extends (infer R)[] | undefined ? R : never>;
}

/** Прочитать видимую страницу ATI, отправить грузы, подсветить строки. */
async function readAndSubmitVisibleLoads(taskId: string): Promise<{ visible: number; sent: number; suitable: number }> {
  const tab = await findAtiTab();
  if (!tab?.id) throw new Error("no_ati_tab");
  const extracted = await sendToContent<{ page: { pageUrl: string }; loads: unknown[] } | { error?: string }>(
    tab.id, { type: "RT_READ_VISIBLE_LOADS" },
  );
  // Ждём callback от content через отдельный listener (см. onMessage ниже).
  // Тут просто просим content выполнить extraction — реальные данные придут в fallback listener,
  // но чтобы упростить flow, извлекаем прямо здесь через второй запрос:
  const data = await sendToContent<{ page: { pageUrl: string }; loads: unknown[] }>(
    tab.id, { type: "RT_READ_VISIBLE_LOADS" },
  );
  const page = data?.page ?? (extracted as { page?: { pageUrl: string } })?.page;
  const loads = Array.isArray(data?.loads) ? data!.loads : [];
  const visible = loads.length;
  let sent = 0; let suitable = 0;
  if (visible > 0 && page?.pageUrl) {
    const resp = await api<LoadsResp>("/api/public/agent/ai-dispatcher/loads", {
      method: "POST",
      body: JSON.stringify({ search_task_id: taskId, source_page_url: page.pageUrl, loads }),
    });
    sent = (resp.created?.length ?? 0) + (resp.updated?.length ?? 0);
    suitable = resp.suitable_count ?? 0;
    const scores = [...(resp.created ?? []), ...(resp.updated ?? [])];
    await sendToContent(tab.id, { type: "RT_HIGHLIGHT_LOADS", scores });
    await sendToContent(tab.id, { type: "RT_SHOW_OVERLAY", state: { sent, suitable, task_id: taskId } });
    // Full-scan: регистрируем страницу через controller (защита от петли/лимита).
    const hashes = loads
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((l: any) => String(l?.agent_open_hint_json?.textHash ?? l?.source_external_ref ?? l?.raw_text ?? ""))
      .filter((h) => h.length > 0);
    const pageRes = await fullScan.submitPage(taskId, page.pageUrl, hashes).catch(() => (
      { ok: false, reason: "controller_error", completed: false } as { ok: boolean; reason?: string; completed: boolean; pagesRead?: number }
    ));
    if (pageRes.completed) {
      await api("/api/public/agent/ai-dispatcher/events", {
        method: "POST",
        body: JSON.stringify({ events: [{
          event_type: "initial_scan_completed",
          search_task_id: taskId,
          payload: { reason: pageRes.reason ?? null, pages_read: pageRes.pagesRead ?? null },
        }] }),
      }).catch(() => undefined);
    }
  }
  await writeStorage({
    [STORAGE_KEYS.lastVisibleCount]: String(visible),
    [STORAGE_KEYS.lastSentCount]: String(sent),
    [STORAGE_KEYS.lastSuitableCount]: String(suitable),
    [STORAGE_KEYS.lastReadAt]: new Date().toISOString(),
  });
  return { visible, sent, suitable };
}

async function handleCommand(c: AgentCommand): Promise<void> {
  await ack(c.id);
  if (c.search_task_id) await writeStorage({ [STORAGE_KEYS.currentTaskId]: c.search_task_id });
  const runId = String((c.command_payload_json as Record<string, unknown> | undefined)?.orchestration_run_id ?? "") || null;
  try {
    // Auth gate для команд, требующих активной ATI-сессии
    if (AUTH_REQUIRED_COMMANDS.has(c.command_type)) {
      let tab = await findAtiTab();
      if (!tab?.id && c.command_type === "refresh_page") {
        throw new Error("no_ati_tab");
      }
      if (tab?.id) {
        const auth = await checkAtiAuth(tab.id);
        if (auth === "login_required") {
          if (c.search_task_id) {
            await upsertWaitingLogin({
              searchTaskId: c.search_task_id,
              orchestrationRunId: runId,
              managedTabId: tab.id,
              waitingSince: new Date().toISOString(),
              lastAuthState: "login_required",
              loginDetectedSent: false,
              createdByAgent: true,
            });
          }
          await fail(c.id, "ati_login_required", "login_required");
          return;
        }
        if (auth === "unknown") {
          await fail(c.id, "auth_state_unknown");
          return;
        }
      }
    }
    if (c.command_type === "open_ati") {
      const created = await chrome.tabs.create({ url: ATI_LOADS_URL, active: false });
      if (c.search_task_id && created?.id) {
        // Сохраним связку task ↔ tab, чтобы scheduler мог её найти.
        await upsertWaitingLogin({
          searchTaskId: c.search_task_id,
          orchestrationRunId: runId,
          managedTabId: created.id,
          waitingSince: new Date().toISOString(),
          lastAuthState: "unknown",
          loginDetectedSent: false,
          createdByAgent: true,
        });
      }
      await complete(c.id, { opened: true, tab_id: created?.id ?? null });
      return;
    }
    if (c.command_type === "refresh_page") {
      const tab = await findAtiTab();
      if (tab?.id) await chrome.tabs.reload(tab.id);
      if (tab?.id && c.search_task_id) {
        await new Promise((r) => setTimeout(r, 2500));
        const r = await readAndSubmitVisibleLoads(c.search_task_id);
        await complete(c.id, { reloaded: true, ...r });
        return;
      }
      await complete(c.id, { reloaded: Boolean(tab?.id) });
      return;
    }
    if (c.command_type === "read_visible_loads") {
      if (!c.search_task_id) throw new Error("missing_search_task_id");
      const r = await readAndSubmitVisibleLoads(c.search_task_id);
      await complete(c.id, r);
      // После первого успешного чтения включаем фоновый scheduler.
      if (r.sent > 0 || r.visible > 0) {
        const tab = await findAtiTab();
        await scheduleTaskRefresh({
          searchTaskId: c.search_task_id,
          managedTabId: tab?.id ?? null,
          taskMode: "search",
          refreshIntervalSeconds: 60,
          orchestrationRunId: runId,
          createdByAgent: true,
          enabled: true,
        });
        await writeStorage({
          [STORAGE_KEYS.nextRefreshAt]: new Date(Date.now() + 60_000).toISOString(),
        });
        await api("/api/public/agent/ai-dispatcher/events", {
          method: "POST",
          body: JSON.stringify({ events: [{
            event_type: "scheduler_started",
            search_task_id: c.search_task_id,
            payload: { interval_sec: 60, run_id: runId },
          }] }),
        }).catch(() => undefined);
      }
      return;
    }
    if (c.command_type === "focus_candidate") {
      const tab = await findAtiTab();
      if (!tab?.id) throw new Error("no_ati_tab");
      const hint = c.command_payload_json ?? {};
      await sendToContent(tab.id, { type: "RT_FOCUS_LOAD", hint });
      await complete(c.id, { focused: true });
      return;
    }
    if (c.command_type === "close_candidate_page") {
      const tab = await findAtiTab();
      if (tab?.id) await sendToContent(tab.id, { type: "RT_CLEAR_HIGHLIGHTS" });
      await complete(c.id, { cleared: true });
      return;
    }
    if (c.command_type === "apply_filters") {
      const tab = await findAtiTab();
      if (!tab?.id) throw new Error("no_ati_tab");
      const payload = (c.command_payload_json ?? {}) as Record<string, unknown>;
      const filters = (payload.filters ?? payload) as Record<string, unknown>;
      const res = await sendToContent<{ ok?: boolean; result?: unknown }>(tab.id, { type: "RT_APPLY_FILTERS", filters });
      let filterReset = false;
      if (c.search_task_id && res?.ok) {
        try {
          const fp = computeFilterFingerprint(filters);
          const sync = await fullScan.startOrSyncFilters(c.search_task_id, fp, {
            sessionId: (await readStorage())[STORAGE_KEYS.sessionId] ?? null,
          });
          filterReset = Boolean(sync?.reset);
        } catch { /* controller уже сохранил ошибку в snapshot */ }
      }
      await complete(c.id, { applied: res?.ok ?? false, result: res?.result ?? null, filter_reset: filterReset });
      return;
    }
    if (c.command_type === "start_search") {
      // Заглушка: пользователь запускает поиск на ATI сам после apply_filters.
      // Успешный complete нужен, чтобы orchestrator продвинулся к read_visible_loads.
      await complete(c.id, { started: true });
      return;
    }
    if (c.command_type === "pause_search" || c.command_type === "stop_search") {
      if (c.search_task_id) await cancelTaskRefresh(c.search_task_id);
      if (c.command_type === "stop_search") {
        await fullScan.stop("stop_search").catch(() => undefined);
      }
      await complete(c.id, { paused: c.command_type === "pause_search", stopped: c.command_type === "stop_search" });
      return;
    }
    await complete(c.id, { noop: true, command_type: c.command_type });
  } catch (e) {
    await fail(c.id, String((e as Error).message ?? e));
  }
}


async function tick(): Promise<void> {
  const s = await readStorage();
  if (!s[STORAGE_KEYS.token]) return;
  await heartbeat();
  const cmds = await pollCommands();
  for (const c of cmds) await handleCommand(c).catch(() => undefined);
}

setInterval(() => { void tick(); }, 30_000);

// ---------- Alarm cycle (background scheduled refresh) ----------
async function handleScheduledRefresh(taskId: string): Promise<void> {
  const s = await readStorage();
  if (!s[STORAGE_KEYS.token]) { await cancelTaskRefresh(taskId); return; }
  const locked = await lockTaskRefresh(taskId);
  if (!locked) {
    await api("/api/public/agent/ai-dispatcher/events", {
      method: "POST",
      body: JSON.stringify({ events: [{ event_type: "refresh_skipped_locked", search_task_id: taskId }] }),
    }).catch(() => undefined);
    return;
  }
  try {
    const status = await getSchedulerStatus(taskId);
    if (status?.should_stop_scheduler || shouldStopScheduler(status?.task_status)) {
      await cancelTaskRefresh(taskId);
      await api("/api/public/agent/ai-dispatcher/events", {
        method: "POST",
        body: JSON.stringify({ events: [{ event_type: "scheduler_stopped", search_task_id: taskId,
          payload: { reason: status?.task_status ?? "unknown" } }] }),
      }).catch(() => undefined);
      return;
    }
    if (!shouldRunScheduledRefresh({
      taskStatus: status?.task_status, autoRefreshEnabled: status?.auto_refresh_enabled ?? true,
    })) return;
    let tab = await findAtiTab();
    if (!tab?.id) {
      // Managed tab был закрыт — пересоздаём.
      const created = await chrome.tabs.create({ url: ATI_LOADS_URL, active: false });
      tab = created;
      await api("/api/public/agent/ai-dispatcher/events", {
        method: "POST",
        body: JSON.stringify({ events: [{ event_type: "managed_tab_recreated", search_task_id: taskId,
          payload: { tab_id: created?.id ?? null } }] }),
      }).catch(() => undefined);
      await new Promise((r) => setTimeout(r, 2500));
    }
    if (!tab?.id) return;
    const auth = await checkAtiAuth(tab.id);
    if (auth !== "authenticated") {
      // Missing logic не запускаем. Просто пропускаем цикл.
      if (auth === "login_required") {
        await upsertWaitingLogin({
          searchTaskId: taskId, orchestrationRunId: null, managedTabId: tab.id,
          waitingSince: new Date().toISOString(), lastAuthState: "login_required",
          loginDetectedSent: false, createdByAgent: true,
        });
        await api("/api/public/agent/ai-dispatcher/events", {
          method: "POST",
          body: JSON.stringify({ events: [{ event_type: "ati_login_required", search_task_id: taskId }] }),
        }).catch(() => undefined);
      }
      return;
    }
    await api("/api/public/agent/ai-dispatcher/events", {
      method: "POST",
      body: JSON.stringify({ events: [{ event_type: "scheduled_refresh_started", search_task_id: taskId }] }),
    }).catch(() => undefined);
    try {
      await chrome.tabs.reload(tab.id);
      await new Promise((r) => setTimeout(r, 2500));
      const r = await readAndSubmitVisibleLoads(taskId);
      // Missing logic safety: только если read успешен.
      if (shouldRunMissingLogic({ taskStatus: status?.task_status, readSuccess: true, authenticated: true })) {
        // Пока missing logic на сервере запускается по /loads — событий достаточно.
      }
      await api("/api/public/agent/ai-dispatcher/events", {
        method: "POST",
        body: JSON.stringify({ events: [{ event_type: "scheduled_refresh_completed", search_task_id: taskId,
          payload: { visible: r.visible, sent: r.sent, suitable: r.suitable } }] }),
      }).catch(() => undefined);
      const interval = normalizeRefreshIntervalSeconds(status?.refresh_interval_seconds ?? 60);
      await writeStorage({ [STORAGE_KEYS.nextRefreshAt]: new Date(Date.now() + interval * 1000).toISOString() });
    } catch (e) {
      await api("/api/public/agent/ai-dispatcher/events", {
        method: "POST",
        body: JSON.stringify({ events: [{ event_type: "scheduled_refresh_failed", search_task_id: taskId,
          payload: { error: String((e as Error).message ?? e) } }] }),
      }).catch(() => undefined);
    }
  } finally {
    await unlockTaskRefresh(taskId);
  }
}

try {
  chrome.alarms?.onAlarm.addListener((alarm) => {
    const taskId = parseAlarmName(alarm.name);
    if (!taskId) return;
    void handleScheduledRefresh(taskId);
  });
} catch { /* alarms may be missing in tests */ }

// ---------- login-detected orchestration resume ----------
async function processLoginDetected(waiting: WaitingLoginTask): Promise<void> {
  if (waiting.loginDetectedSent) return;
  const lockKey = `login_detected:${waiting.searchTaskId}`;
  const locked = await lockTaskRefresh(lockKey, 15_000);
  if (!locked) return;
  try {
    const resp = await api<{ ok?: boolean; advance_status?: string; orchestration_status?: string }>(
      "/api/public/agent/ai-dispatcher/login-detected",
      {
        method: "POST",
        body: JSON.stringify({
          search_task_id: waiting.searchTaskId,
          orchestration_run_id: waiting.orchestrationRunId,
          tab_id: waiting.managedTabId,
          detected_at: new Date().toISOString(),
        }),
      },
    );
    if (resp?.ok) {
      waiting.loginDetectedSent = true;
      await upsertWaitingLogin(waiting);
      await removeWaitingLogin(waiting.searchTaskId);
    }
  } catch {
    // Оставляем waiting запись для повторной попытки.
  } finally {
    await unlockTaskRefresh(lockKey);
  }
}

// ---------- Web ↔ Extension bridge (через content script web-bridge.js) ----------

// ---------- Web ↔ Extension bridge (через content script web-bridge.js) ----------
import { isTrustedAgentOrigin } from "./agent-origins";

async function handleBridgeMessage(
  bridgeType: string,
  origin: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  if (!isTrustedAgentOrigin(origin)) {
    return { ok: false, error: "untrusted_origin" };
  }
  const s = await readStorage();

  if (bridgeType === "RT_AGENT_PING") {
    return {
      ok: true,
      data: {
        installed: true,
        connected: Boolean(s[STORAGE_KEYS.token]),
        agentVersion: AGENT_VERSION,
        protocolVersion: AGENT_PROTOCOL_VERSION,
      },
    };
  }
  if (bridgeType === "RT_AGENT_STATUS") {
    const hasToken = Boolean(s[STORAGE_KEYS.token]);
    return {
      ok: true,
      data: {
        installed: true,
        connected: hasToken,
        agentVersion: AGENT_VERSION,
        protocolVersion: AGENT_PROTOCOL_VERSION,
        lastHeartbeatAt: s[STORAGE_KEYS.lastHeartbeat] ?? null,
        needsReconnect: !hasToken,
      },
    };
  }
  if (bridgeType === "RT_AGENT_CONNECT_REQUEST") {
    const challengeId = String(payload?.challenge_id ?? "").trim();
    const challengeSecret = String(payload?.challenge_secret ?? "").trim();
    const reqOrigin = String(payload?.origin ?? origin).trim();
    if (!challengeId || !challengeSecret) {
      return { ok: false, error: "missing_challenge" };
    }
    if (!isTrustedAgentOrigin(reqOrigin) || reqOrigin !== origin) {
      return { ok: false, error: "untrusted_origin" };
    }
    try {
      const res = await fetch(`${reqOrigin}/api/public/agent/ai-dispatcher/pair-auto`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challenge_id: challengeId,
          challenge_secret: challengeSecret,
          origin: reqOrigin,
          agent_version: AGENT_VERSION,
          protocol_version: AGENT_PROTOCOL_VERSION,
          browser_name: "Chrome",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.agent_token) {
        return {
          ok: false,
          data: { installed: true, connected: false, errorCode: data?.error ?? "pair_failed" },
        };
      }
      await writeStorage({
        [STORAGE_KEYS.baseUrl]: reqOrigin,
        [STORAGE_KEYS.token]: data.agent_token,
        [STORAGE_KEYS.sessionId]: data.session_id,
      });
      // heartbeat сразу — чтобы Web увидел connected.
      void heartbeat();
      return {
        ok: true,
        data: {
          installed: true,
          connected: true,
          sessionStatus: "connected",
          agentVersion: AGENT_VERSION,
        },
      };
    } catch (e) {
      return { ok: false, error: String((e as Error).message ?? e) };
    }
  }
  if (bridgeType === "RT_AGENT_DISCONNECT") {
    // Отзываем и очищаем локальный token.
    try {
      if (s[STORAGE_KEYS.baseUrl] && s[STORAGE_KEYS.token]) {
        await api("/api/public/agent/ai-dispatcher/events", {
          method: "POST",
          body: JSON.stringify({ events: [{ event_type: "agent_disconnected_by_user" }] }),
        }).catch(() => undefined);
      }
    } finally {
      await writeStorage({
        [STORAGE_KEYS.token]: "",
        [STORAGE_KEYS.sessionId]: "",
      });
    }
    return { ok: true, data: { installed: true, connected: false } };
  }
  return { ok: false, error: "unknown_bridge_type" };
}

// ---------- Восстановление подключения после перезапуска ----------
async function restoreOnStart(): Promise<void> {
  const s = await readStorage();
  if (!s[STORAGE_KEYS.token] || !s[STORAGE_KEYS.baseUrl]) return;
  try {
    const res = await fetch(`${s[STORAGE_KEYS.baseUrl]}/api/public/agent/ai-dispatcher/session-health`, {
      headers: { Authorization: `Bearer ${s[STORAGE_KEYS.token]}` },
    });
    if (res.status === 401 || res.status === 404) {
      await writeStorage({ [STORAGE_KEYS.token]: "", [STORAGE_KEYS.sessionId]: "" });
      return;
    }
    const data = await res.json().catch(() => null);
    if (data?.token_status === "revoked" || data?.token_status === "expired") {
      await writeStorage({ [STORAGE_KEYS.token]: "", [STORAGE_KEYS.sessionId]: "" });
      return;
    }
    void heartbeat();
    // Восстанавливаем Full Scan runtime из snapshot (один запрос status максимум).
    await fullScan.restore().catch(() => undefined);
    // Восстанавливаем schedules и события agent_state_restored.
    try {
      await restoreActiveSearchSchedules();
      const tasks = await getScheduledTasks();
      await api("/api/public/agent/ai-dispatcher/events", {
        method: "POST",
        body: JSON.stringify({ events: [{
          event_type: "agent_state_restored",
          payload: { schedules: tasks.length },
        }] }),
      }).catch(() => undefined);
      for (const t of tasks) {
        await api("/api/public/agent/ai-dispatcher/events", {
          method: "POST",
          body: JSON.stringify({ events: [{
            event_type: "scheduler_restored", search_task_id: t.searchTaskId,
          }] }),
        }).catch(() => undefined);
      }
    } catch { /* ignore restore errors */ }
  } catch { /* offline — оставляем token */ }
}

try {
  chrome.runtime.onStartup?.addListener(() => { void restoreOnStart(); });
  chrome.runtime.onInstalled?.addListener(() => { void restoreOnStart(); });
} catch { /* ignore */ }
void restoreOnStart();

// Bridge для popup / manual actions / content / web-bridge.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      // Auth state change из content script — единственный источник login-detected.
      if (msg?.type === "RT_ATI_AUTH_STATE_CHANGED") {
        const senderTabId = sender?.tab?.id;
        if (msg.emitLoginDetected && senderTabId) {
          const map = await readWaitingLogin();
          const waiting = Object.values(map).find((w) => w.managedTabId === senderTabId)
            ?? Object.values(map)[0];
          if (waiting) await processLoginDetected(waiting);
        }
        if (msg.emitLoginRequired && senderTabId) {
          // Обновим lastAuthState для соответствующей записи.
          const map = await readWaitingLogin();
          const w = Object.values(map).find((x) => x.managedTabId === senderTabId);
          if (w) { w.lastAuthState = "login_required"; await upsertWaitingLogin(w); }
        }
        sendResponse({ ok: true });
        return;
      }
      if (msg?.type === "rt/bridge") {
        const senderOrigin = String(msg.origin ?? sender?.origin ?? sender?.url ?? "");
        const out = await handleBridgeMessage(
          String(msg.bridgeType ?? ""),
          senderOrigin,
          (msg.payload ?? {}) as Record<string, unknown>,
        );
        sendResponse(out);
        return;
      }
      if (msg?.type === "rt/pair") {
        const res = await fetch(`${msg.baseUrl}/api/public/agent/ai-dispatcher/pair`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ pairing_code: msg.pairing_code, agent_version: AGENT_VERSION, protocol_version: AGENT_PROTOCOL_VERSION, browser_name: "Chrome" }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "pair_failed");
        await writeStorage({
          [STORAGE_KEYS.baseUrl]: msg.baseUrl,
          [STORAGE_KEYS.token]: data.agent_token,
          [STORAGE_KEYS.sessionId]: data.session_id,
        });
        sendResponse({ ok: true, session_id: data.session_id });
        return;
      }
      if (msg?.type === "rt/status") { sendResponse(await readStorage()); return; }
      if (msg?.type === "rt/disconnect") {
        await writeStorage({ [STORAGE_KEYS.token]: "", [STORAGE_KEYS.sessionId]: "" });
        sendResponse({ ok: true }); return;
      }
      if (msg?.type === "rt/read-current-page") {
        const s = await readStorage();
        const taskId = msg.search_task_id ?? s[STORAGE_KEYS.currentTaskId];
        if (!taskId) throw new Error("missing_search_task_id");
        const r = await readAndSubmitVisibleLoads(taskId);
        sendResponse({ ok: true, ...r });
        return;
      }
      if (msg?.type === "rt/show-overlay") {
        const tab = await findAtiTab();
        if (tab?.id) await sendToContent(tab.id, { type: "RT_SHOW_OVERLAY", state: {} });
        sendResponse({ ok: true }); return;
      }
      if (msg?.type === "rt/hide-overlay") {
        const tab = await findAtiTab();
        if (tab?.id) await sendToContent(tab.id, { type: "RT_HIDE_OVERLAY" });
        sendResponse({ ok: true }); return;
      }
      // rt/send-mock-loads удалён в 0.2.3 — реальные грузы только из ATI DOM.

      if (msg?.type === "rt/diagnostics") {
        const tab = await findAtiTab();
        const raw = tab?.id ? await sendToContent<{ diagnostics?: unknown }>(tab.id, { type: "RT_DIAGNOSTICS" }) : null;
        const diagnostics = sanitizeAgentDiagnostics({
          build_info: BUILD_INFO,
          page: raw?.diagnostics ?? null,
          has_ati_tab: Boolean(tab?.id),
        });
        sendResponse({ ok: true, diagnostics });
        return;
      }
      if (msg?.type === "rt/build-info") {
        sendResponse({ ok: true, build_info: BUILD_INFO });
        return;
      }
      if (msg?.type === "rt/session-health") {
        try {
          const data = await api<Record<string, unknown>>("/api/public/agent/ai-dispatcher/session-health");
          sendResponse({ ok: true, data });
        } catch (e) {
          sendResponse({ ok: false, error: String((e as Error).message ?? e) });
        }
        return;
      }
      if (msg?.type === "rt/add-to-call-queue") {
        if (!msg.candidate_id) throw new Error("missing_candidate_id");
        try {
          const r = await api<{ already?: boolean }>(
            `/api/public/agent/ai-dispatcher/call-queue/${encodeURIComponent(msg.candidate_id)}`,
            { method: "POST", body: JSON.stringify({ source: "ati_page_button" }) },
          );
          sendResponse({ ok: true, already: Boolean(r?.already) });
        } catch (e) {
          sendResponse({ ok: false, error: String((e as Error).message ?? e) });
        }
        return;
      }
      sendResponse({ error: "unknown_message" });
    } catch (e) {
      sendResponse({ error: String((e as Error).message ?? e) });
    }
  })();
  return true; // async
});

// extension_build_loaded — безопасное событие о загрузке background.
(async () => {
  try {
    const s = await readStorage();
    if (!s[STORAGE_KEYS.token]) return;
    await api("/api/public/agent/ai-dispatcher/events", {
      method: "POST",
      body: JSON.stringify({
        events: [{ event_type: "extension_build_loaded", payload: buildLoadedPayload(),
          message: `Browser Agent ${AGENT_VERSION} (${BUILD_CHANNEL})` }],
      }),
    });
  } catch { /* игнорируем — не критично */ }
})();

console.log(`[radius-track-agent] background loaded v${AGENT_VERSION} (protocol ${AGENT_PROTOCOL_VERSION}, build_date=${BUILD_DATE})`);
export {};
