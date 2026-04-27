// Простая офлайн-очередь с повторами для произвольных async-операций.
// Сохраняет задачи в localStorage, повторяет с экспоненциальной задержкой
// и автоматически возобновляет работу при возврате сети.

export type QueueOp = {
  id: string;
  kind: string; // например, "staff.save" / "staff.toggle" / "staff.remove"
  label?: string; // человекочитаемое описание
  payload: unknown;
  attempts: number;
  nextAt: number; // timestamp ms
  createdAt: number;
};

type Handler = (payload: unknown) => Promise<void>;

const STORAGE_KEY = "lovable.offline-queue.v1";
const MAX_ATTEMPTS = 8;
const BASE_DELAY = 1500; // 1.5s
const MAX_DELAY = 60_000; // 1 min

const handlers = new Map<string, Handler>();
const listeners = new Set<(items: QueueOp[]) => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let processing = false;

const isBrowser = () => typeof window !== "undefined";

function load(): QueueOp[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(items: QueueOp[]) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore quota
  }
  listeners.forEach((l) => l(items));
}

function backoff(attempts: number) {
  return Math.min(MAX_DELAY, BASE_DELAY * Math.pow(2, Math.max(0, attempts - 1)));
}

function scheduleNext() {
  if (!isBrowser()) return;
  const items = load();
  if (items.length === 0) {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    return;
  }
  const now = Date.now();
  const due = Math.max(0, Math.min(...items.map((i) => i.nextAt - now)));
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    void processQueue();
  }, due);
}

export async function processQueue() {
  if (!isBrowser() || processing) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    scheduleNext();
    return;
  }
  processing = true;
  try {
    let items = load();
    const now = Date.now();
    const ready = items.filter((i) => i.nextAt <= now);
    for (const item of ready) {
      const handler = handlers.get(item.kind);
      if (!handler) {
        // нет обработчика — отложим
        item.nextAt = Date.now() + 5000;
        continue;
      }
      try {
        await handler(item.payload);
        items = load().filter((i) => i.id !== item.id);
        save(items);
      } catch (err) {
        items = load();
        const idx = items.findIndex((i) => i.id === item.id);
        if (idx >= 0) {
          items[idx].attempts += 1;
          if (items[idx].attempts >= MAX_ATTEMPTS) {
            // отказ — убираем, чтобы не зацикливаться
            items.splice(idx, 1);
            console.error("[offline-queue] dropped after max attempts", item, err);
          } else {
            items[idx].nextAt = Date.now() + backoff(items[idx].attempts);
          }
          save(items);
        }
      }
    }
  } finally {
    processing = false;
    scheduleNext();
  }
}

export function registerHandler(kind: string, handler: Handler) {
  handlers.set(kind, handler);
  // как только обработчик появился — попробуем обработать
  scheduleNext();
}

export function enqueue(kind: string, payload: unknown, label?: string) {
  if (!isBrowser()) return;
  const items = load();
  const op: QueueOp = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    label,
    payload,
    attempts: 0,
    nextAt: Date.now(),
    createdAt: Date.now(),
  };
  items.push(op);
  save(items);
  scheduleNext();
}

export function getQueue(): QueueOp[] {
  return load();
}

export function subscribe(fn: (items: QueueOp[]) => void) {
  listeners.add(fn);
  fn(load());
  return () => {
    listeners.delete(fn);
  };
}

export function clearFailed() {
  save([]);
}

if (isBrowser()) {
  window.addEventListener("online", () => {
    void processQueue();
  });
  // первичный запуск (вдруг что-то осталось с прошлой сессии)
  setTimeout(() => {
    void processQueue();
  }, 500);
}
