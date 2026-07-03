// Radius Track Browser Agent — background service worker.
// Никакого API ATI. Хранит agent token в chrome.storage.local и общается
// только с /api/public/agent/ai-dispatcher/* endpoints Радиус Трек.
const STORAGE_KEYS = {
  baseUrl: "rt_base_url",
  token: "rt_agent_token",
  sessionId: "rt_session_id",
  lastHeartbeat: "rt_last_heartbeat",
  lastError: "rt_last_error",
  currentTaskId: "rt_current_task_id",
} as const;

type Storage = Partial<Record<keyof typeof STORAGE_KEYS, string>>;

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

async function heartbeat(): Promise<void> {
  const tabs = await new Promise<chrome.tabs.Tab[]>((r) =>
    chrome.tabs.query({ url: "https://ati.su/*" }, (t) => r(t)),
  );
  try {
    await api("/api/public/agent/ai-dispatcher/heartbeat", {
      method: "POST",
      body: JSON.stringify({
        agent_version: "0.0.1-dev",
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
  } catch {
    return [];
  }
}

async function ack(id: string) {
  await api(`/api/public/agent/ai-dispatcher/commands/${id}/ack`, { method: "POST", body: "{}" });
}
async function complete(id: string, result: Record<string, unknown>) {
  await api(`/api/public/agent/ai-dispatcher/commands/${id}/complete`, {
    method: "POST", body: JSON.stringify({ result_json: result }),
  });
}

async function handleCommand(c: AgentCommand): Promise<void> {
  await ack(c.id);
  if (c.search_task_id) await writeStorage({ [STORAGE_KEYS.currentTaskId]: c.search_task_id });
  if (c.command_type === "open_ati") {
    await chrome.tabs.create({ url: "https://ati.su/loads/", active: false });
    await complete(c.id, { opened: true });
    return;
  }
  if (c.command_type === "refresh_page") {
    const tabs = await new Promise<chrome.tabs.Tab[]>((r) =>
      chrome.tabs.query({ url: "https://ati.su/loads*" }, (t) => r(t)),
    );
    for (const t of tabs) if (t.id) await chrome.tabs.reload(t.id);
    await complete(c.id, { reloaded: tabs.length });
    return;
  }
  // Прочие команды пока просто ack+complete как noop (skeleton stage).
  await complete(c.id, { noop: true, command_type: c.command_type });
}

async function tick(): Promise<void> {
  const s = await readStorage();
  if (!s[STORAGE_KEYS.token]) return;
  await heartbeat();
  const cmds = await pollCommands();
  for (const c of cmds) await handleCommand(c).catch(() => undefined);
}

setInterval(() => { void tick(); }, 30_000);

// Bridge для popup / manual actions.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "rt/pair") {
        const res = await fetch(`${msg.baseUrl}/api/public/agent/ai-dispatcher/pair`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ pairing_code: msg.pairing_code, agent_version: "0.0.1-dev", browser_name: "Chrome" }),
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
      if (msg?.type === "rt/status") {
        sendResponse(await readStorage());
        return;
      }
      if (msg?.type === "rt/disconnect") {
        await writeStorage({ [STORAGE_KEYS.token]: "", [STORAGE_KEYS.sessionId]: "" });
        sendResponse({ ok: true });
        return;
      }
      if (msg?.type === "rt/send-mock-loads") {
        const s = await readStorage();
        const taskId = msg.search_task_id ?? s[STORAGE_KEYS.currentTaskId];
        if (!taskId) throw new Error("missing_search_task_id");
        const loads = [
          { pickup_city: "Москва", delivery_city: "Санкт-Петербург", weight: 20, price: 45000, distance_km: 700, raw_text: "M-SPB 20т", source_external_ref: `mock-${Date.now()}-1` },
          { pickup_city: "Москва", delivery_city: "Казань", weight: 10, price: 30000, distance_km: 800, raw_text: "M-KZN 10т", source_external_ref: `mock-${Date.now()}-2` },
        ];
        await api("/api/public/agent/ai-dispatcher/loads", {
          method: "POST",
          body: JSON.stringify({ search_task_id: taskId, source_page_url: "https://ati.su/loads/", loads }),
        });
        sendResponse({ ok: true, sent: loads.length });
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
