// Radius Track Browser Agent — background service worker.
// Никакого API ATI. Хранит agent token в chrome.storage.local и общается
// только с /api/public/agent/ai-dispatcher/* endpoints Радиус Трек.
import {
  AGENT_VERSION, AGENT_PROTOCOL_VERSION, ATI_SELECTOR_CONFIG_VERSION,
  BUILD_CHANNEL, BUILD_DATE,
} from "./version";
import { BUILD_INFO, buildLoadedPayload } from "./build-info";
import { sanitizeAgentDiagnostics } from "./sanitize";
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
} as const;

type Storage = Partial<Record<(typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS], string>>;

async function readStorage(): Promise<Storage> {
  const keys = Object.values(STORAGE_KEYS);
  return new Promise((resolve) => chrome.storage.local.get(keys, (v) => resolve(v as Storage)));
}
async function writeStorage(patch: Storage): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.set(patch, () => resolve()));
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
    chrome.tabs.query({ url: "https://ati.su/*" }, (t) => r(t)),
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
    chrome.tabs.query({ url: "https://ati.su/*" }, (t) => r(t)),
  );
  try {
    await api("/api/public/agent/ai-dispatcher/heartbeat", {
      method: "POST",
      body: JSON.stringify({
        agent_version: "0.1.1-dev",
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
async function fail(id: string, error: string) {
  await api(`/api/public/agent/ai-dispatcher/commands/${id}/fail`, {
    method: "POST", body: JSON.stringify({ error_message: error }),
  });
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
  try {
    if (c.command_type === "open_ati") {
      await chrome.tabs.create({ url: "https://ati.su/loads/", active: false });
      await complete(c.id, { opened: true });
      return;
    }
    if (c.command_type === "refresh_page") {
      const tab = await findAtiTab();
      if (tab?.id) await chrome.tabs.reload(tab.id);
      // После reload — небольшая задержка и чтение.
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
      const filters = (c.command_payload_json?.filters ?? c.command_payload_json ?? {}) as Record<string, unknown>;
      const res = await sendToContent<{ ok?: boolean; result?: unknown }>(tab.id, { type: "RT_APPLY_FILTERS", filters });
      await complete(c.id, { applied: res?.ok ?? false, result: res?.result ?? null });
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

// Bridge для popup / manual actions / content.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "rt/pair") {
        const res = await fetch(`${msg.baseUrl}/api/public/agent/ai-dispatcher/pair`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ pairing_code: msg.pairing_code, agent_version: "0.1.1-dev", browser_name: "Chrome" }),
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
      if (msg?.type === "rt/send-mock-loads") {
        const s = await readStorage();
        const taskId = msg.search_task_id ?? s[STORAGE_KEYS.currentTaskId];
        if (!taskId) throw new Error("missing_search_task_id");
        const loads = [
          { pickup_city: "Москва", delivery_city: "Санкт-Петербург", weight: 20, price: 45000, distance_km: 700, raw_text: "M-SPB 20т", source_external_ref: `mock-${Date.now()}-1` },
          { pickup_city: "Москва", delivery_city: "Казань", weight: 10, price: 30000, distance_km: 800, raw_text: "M-KZN 10т", source_external_ref: `mock-${Date.now()}-2` },
        ];
        const resp = await api<LoadsResp>("/api/public/agent/ai-dispatcher/loads", {
          method: "POST",
          body: JSON.stringify({ search_task_id: taskId, source_page_url: "https://ati.su/loads/", loads }),
        });
        sendResponse({ ok: true, sent: (resp.created?.length ?? 0) + (resp.updated?.length ?? 0), suitable: resp.suitable_count ?? 0 });
        return;
      }
      if (msg?.type === "rt/diagnostics") {
        const tab = await findAtiTab();
        if (!tab?.id) throw new Error("no_ati_tab");
        const r = await sendToContent<{ diagnostics?: unknown }>(tab.id, { type: "RT_DIAGNOSTICS" });
        sendResponse({ ok: true, diagnostics: r?.diagnostics ?? null });
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

console.log("[radius-track-agent] background loaded");
export {};
