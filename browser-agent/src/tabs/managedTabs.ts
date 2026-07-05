// Управляемые вкладки ATI. Одна задача поиска → одна вкладка.
// Агент закрывает только вкладки, созданные им самим.

export type ManagedTabStatus =
  | "opening"
  | "ready"
  | "searching"
  | "reading"
  | "stale"
  | "closed"
  | "error";

export interface ManagedAtiTab {
  tabId: number;
  searchTaskId: string;
  vehicleId?: string;
  taskMode: "main_load" | "additional_load";
  createdByAgent: boolean;
  currentUrl?: string;
  lastRefreshAt?: string;
  status: ManagedTabStatus;
}

const KEY = "rt_managed_tabs_v1";

async function readAll(): Promise<Record<string, ManagedAtiTab>> {
  return new Promise((r) => chrome.storage.local.get([KEY], (v) => r(v?.[KEY] ?? {})));
}
async function writeAll(v: Record<string, ManagedAtiTab>): Promise<void> {
  return new Promise((r) => chrome.storage.local.set({ [KEY]: v }, () => r()));
}

export async function getForTask(searchTaskId: string): Promise<ManagedAtiTab | null> {
  const all = await readAll();
  return all[searchTaskId] ?? null;
}
export async function listManaged(): Promise<ManagedAtiTab[]> {
  return Object.values(await readAll());
}
export async function upsertManaged(t: ManagedAtiTab): Promise<void> {
  const all = await readAll();
  all[t.searchTaskId] = t;
  await writeAll(all);
}
export async function removeManaged(searchTaskId: string): Promise<void> {
  const all = await readAll();
  delete all[searchTaskId];
  await writeAll(all);
}

/** Верификация: вкладка всё ещё существует и создана нами. */
export async function verifyTab(t: ManagedAtiTab): Promise<boolean> {
  if (!t.createdByAgent) return false;
  try {
    const tab = await new Promise<chrome.tabs.Tab | undefined>((r) =>
      chrome.tabs.get(t.tabId, (v) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (chrome as any).runtime?.lastError;
        r(v);
      }),
    );
    return Boolean(tab?.id);
  } catch {
    return false;
  }
}

/** После рестарта service worker: сверить сохранённые вкладки с реальным состоянием. */
export async function restoreManagedTabs(): Promise<ManagedAtiTab[]> {
  const all = await readAll();
  const alive: Record<string, ManagedAtiTab> = {};
  for (const [k, t] of Object.entries(all)) {
    if (await verifyTab(t)) alive[k] = t;
  }
  await writeAll(alive);
  return Object.values(alive);
}
