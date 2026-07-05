// Единое состояние Browser Agent. Хранится в chrome.storage.local.
// Не содержит паролей, cookies или данных пользователя ATI.

export type ConnectionStatus =
  | "disconnected"
  | "pairing"
  | "connected"
  | "error";

export type AgentMode =
  | "idle"
  | "searching"
  | "refreshing"
  | "reading"
  | "paused";

export interface BrowserAgentState {
  connectionStatus: ConnectionStatus;
  agentMode: AgentMode;
  sessionId?: string;
  currentTaskIds: string[];
  lastHeartbeatAt?: string;
  lastCommandAt?: string;
  lastReadAt?: string;
  lastError?: string;
  counters: {
    activeTabs: number;
    visibleLoads: number;
    sentLoads: number;
    suitableLoads: number;
  };
}

export const DEFAULT_STATE: BrowserAgentState = {
  connectionStatus: "disconnected",
  agentMode: "idle",
  currentTaskIds: [],
  counters: { activeTabs: 0, visibleLoads: 0, sentLoads: 0, suitableLoads: 0 },
};

const STATE_KEY = "rt_agent_state_v1";

export async function loadState(): Promise<BrowserAgentState> {
  return new Promise((resolve) =>
    chrome.storage.local.get([STATE_KEY], (v) => {
      resolve({ ...DEFAULT_STATE, ...(v?.[STATE_KEY] ?? {}) });
    }),
  );
}

export async function saveState(patch: Partial<BrowserAgentState>): Promise<BrowserAgentState> {
  const cur = await loadState();
  const next: BrowserAgentState = {
    ...cur,
    ...patch,
    counters: { ...cur.counters, ...(patch.counters ?? {}) },
  };
  await new Promise<void>((r) => chrome.storage.local.set({ [STATE_KEY]: next }, () => r()));
  return next;
}
