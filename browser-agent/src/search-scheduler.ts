// Search Scheduler для Browser Agent.
// Использует chrome.alarms + chrome.storage.local. Работает без открытой вкладки Радиус Трек.
// НЕ закрывает пользовательские вкладки: только createdByAgent=true.
// Никаких секретов в storage: только id, интервалы, флаги.

import { normalizeRefreshIntervalSeconds } from "../../src/lib/ai-dispatcher/orchestrator-transitions";
// ⚠ Импорт TS выше используется только для типов; сам файл собирается esbuild
// вместе с background.ts. Если tsc жалуется — заменить на локальную функцию.

const ALARM_PREFIX = "rt-search-refresh:";
const STORAGE_KEY = "rt_scheduled_tasks_v1";
const LOCK_KEY = "rt_scheduler_locks_v1";

export interface ScheduledTaskState {
  searchTaskId: string;
  managedTabId: number | null;
  taskMode: "search" | "bundle" | "return";
  refreshIntervalSeconds: number;
  nextRefreshAt: string | null;
  lastRefreshAt: string | null;
  enabled: boolean;
  orchestrationRunId: string | null;
  failureCount: number;
  createdByAgent: boolean;
}

type StateMap = Record<string, ScheduledTaskState>;

async function readAll(): Promise<StateMap> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (v) => resolve((v?.[STORAGE_KEY] as StateMap) ?? {}));
  });
}
async function writeAll(map: StateMap): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.set({ [STORAGE_KEY]: map }, () => resolve()));
}
async function readLocks(): Promise<Record<string, number>> {
  return new Promise((resolve) => chrome.storage.local.get([LOCK_KEY], (v) => resolve((v?.[LOCK_KEY] as Record<string, number>) ?? {})));
}
async function writeLocks(m: Record<string, number>): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.set({ [LOCK_KEY]: m }, () => resolve()));
}

export async function scheduleTaskRefresh(state: Partial<ScheduledTaskState> & { searchTaskId: string }): Promise<void> {
  const map = await readAll();
  const prev = map[state.searchTaskId] ?? {
    searchTaskId: state.searchTaskId, managedTabId: null, taskMode: "search",
    refreshIntervalSeconds: 60, nextRefreshAt: null, lastRefreshAt: null,
    enabled: true, orchestrationRunId: null, failureCount: 0, createdByAgent: false,
  };
  const interval = normalizeRefreshIntervalSeconds(state.refreshIntervalSeconds ?? prev.refreshIntervalSeconds);
  const next: ScheduledTaskState = {
    ...prev, ...state,
    refreshIntervalSeconds: interval,
    nextRefreshAt: new Date(Date.now() + interval * 1000).toISOString(),
    enabled: state.enabled ?? true,
  };
  map[state.searchTaskId] = next;
  await writeAll(map);
  chrome.alarms.create(ALARM_PREFIX + state.searchTaskId, {
    delayInMinutes: interval / 60,
    periodInMinutes: interval / 60,
  });
}

export async function cancelTaskRefresh(searchTaskId: string): Promise<void> {
  const map = await readAll();
  delete map[searchTaskId];
  await writeAll(map);
  chrome.alarms.clear(ALARM_PREFIX + searchTaskId);
}

export async function getScheduledTasks(): Promise<ScheduledTaskState[]> {
  const map = await readAll();
  return Object.values(map);
}

export async function lockTaskRefresh(searchTaskId: string, ttlMs = 90_000): Promise<boolean> {
  const locks = await readLocks();
  const now = Date.now();
  if (locks[searchTaskId] && locks[searchTaskId] > now) return false;
  locks[searchTaskId] = now + ttlMs;
  await writeLocks(locks);
  return true;
}
export async function unlockTaskRefresh(searchTaskId: string): Promise<void> {
  const locks = await readLocks();
  delete locks[searchTaskId];
  await writeLocks(locks);
}

/** Восстановление alarms после запуска Chrome. */
export async function restoreActiveSearchSchedules(): Promise<void> {
  const map = await readAll();
  for (const s of Object.values(map)) {
    if (!s.enabled) continue;
    const interval = normalizeRefreshIntervalSeconds(s.refreshIntervalSeconds);
    chrome.alarms.create(ALARM_PREFIX + s.searchTaskId, {
      delayInMinutes: interval / 60,
      periodInMinutes: interval / 60,
    });
  }
}

/** Извлечь searchTaskId из имени alarm. */
export function parseAlarmName(name: string): string | null {
  return name.startsWith(ALARM_PREFIX) ? name.slice(ALARM_PREFIX.length) : null;
}
