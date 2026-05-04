// Простая офлайн-очередь действий водителя.
// Без GPS — координаты в payload опциональны и могут быть null.
// Хранение: localStorage (per-browser). Отправка — при появлении сети.

import { advanceTripStageFn, recordRouteReturnFn } from "@/lib/server-functions/trip-stage.functions";

const STORAGE_KEY = "driver-offline-queue:v1";

export type QueuedAction =
  | {
      id: string;
      kind: "advance_stage";
      createdAt: number;
      payload: Parameters<typeof advanceTripStageFn>[0]["data"];
    }
  | {
      id: string;
      kind: "record_return";
      createdAt: number;
      payload: Parameters<typeof recordRouteReturnFn>[0]["data"];
    };

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function readQueue(): QueuedAction[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedAction[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(items: QueuedAction[]) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    // Уведомляем подписчиков в этой же вкладке
    window.dispatchEvent(new CustomEvent("driver-offline-queue:changed"));
  } catch {
    /* квота */
  }
}

export function enqueueAction(
  kind: QueuedAction["kind"],
  payload: QueuedAction["payload"],
): QueuedAction {
  const action = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    createdAt: Date.now(),
    payload,
  } as QueuedAction;
  const items = readQueue();
  items.push(action);
  writeQueue(items);
  return action;
}

export function removeAction(id: string) {
  writeQueue(readQueue().filter((a) => a.id !== id));
}

export function isOnline(): boolean {
  if (!isBrowser()) return true;
  return navigator.onLine !== false;
}

let flushing = false;

export async function flushQueue(): Promise<{ sent: number; failed: number }> {
  if (!isBrowser() || flushing || !isOnline()) return { sent: 0, failed: 0 };
  flushing = true;
  let sent = 0;
  let failed = 0;
  try {
    // Каждый раз перечитываем — действия могли добавляться параллельно
    const items = readQueue();
    for (const action of items) {
      try {
        if (action.kind === "advance_stage") {
          await advanceTripStageFn({ data: action.payload });
        } else if (action.kind === "record_return") {
          await recordRouteReturnFn({ data: action.payload });
        }
        removeAction(action.id);
        sent++;
      } catch (e) {
        // Сетевая ошибка — выходим, попробуем позже.
        // Бизнес-ошибка (в идеале — определимая по тексту) — удаляем, чтобы не зацикливаться.
        const msg = e instanceof Error ? e.message : String(e);
        const isNetwork = /network|fetch|failed to fetch|load failed/i.test(msg);
        if (isNetwork) break;
        removeAction(action.id);
        failed++;
      }
    }
  } finally {
    flushing = false;
  }
  return { sent, failed };
}

export function subscribeQueue(listener: () => void): () => void {
  if (!isBrowser()) return () => {};
  const onChange = () => listener();
  window.addEventListener("driver-offline-queue:changed", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("driver-offline-queue:changed", onChange);
    window.removeEventListener("storage", onChange);
  };
}
