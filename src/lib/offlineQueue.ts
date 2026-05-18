// Простая офлайн-очередь действий водителя.
// Хранение: localStorage (per-browser). Отправка — при появлении сети.

import { apiPost, apiPatch } from "@/lib/api-client";
import type { TripStage } from "@/lib/tripStage";

const STORAGE_KEY = "driver-offline-queue:v2";

export type QueuedAction =
  | { id: string; kind: "advance_stage"; createdAt: number; payload: AdvanceStagePayload }
  | { id: string; kind: "record_return"; createdAt: number; payload: RecordReturnPayload }
  | { id: string; kind: "point_status_update"; createdAt: number; payload: PointStatusUpdatePayload }
  | { id: string; kind: "point_payment_update"; createdAt: number; payload: PointPaymentUpdatePayload }
  | { id: string; kind: "log_point_action"; createdAt: number; payload: LogPointActionPayload }
  | { id: string; kind: "route_finish"; createdAt: number; payload: RouteFinishPayload };

export type AdvanceStagePayload = {
  deliveryRouteId: string;
  stage: TripStage;
  comment?: string | null;
  gps?: { lat: number; lng: number } | null;
  actorName?: string | null;
};

export type RecordReturnPayload = {
  deliveryRouteId: string;
  orderId?: string | null;
  reason: string;
  comment?: string | null;
  actorName?: string | null;
};

export type PointStatusUpdatePayload = {
  routePointId: string;
  patch: Record<string, unknown>;
  parentRouteId?: string | null;
};

export type PointPaymentUpdatePayload = {
  routePointId: string;
  orderId: string;
  orderUpdate: { cash_received?: boolean; qr_received?: boolean };
  pointUpdate: { dp_amount_received?: number | null; dp_payment_comment?: string | null };
};

export type LogPointActionPayload = {
  routePointId: string;
  orderId?: string | null;
  routeId?: string | null;
  action: string;
  actor?: string | null;
  details?: Record<string, unknown>;
  comment?: string | null;
};

export type RouteFinishPayload = {
  deliveryRouteId: string;
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
    window.dispatchEvent(new CustomEvent("driver-offline-queue:changed"));
  } catch {
    /* квота */
  }
}

export function enqueueAction<K extends QueuedAction["kind"]>(
  kind: K,
  payload: Extract<QueuedAction, { kind: K }>["payload"],
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

/** Есть ли в очереди что-то по конкретному маршруту/точке */
export function hasPendingForRoute(deliveryRouteId: string, routePointIds: string[] = []): boolean {
  const ids = new Set(routePointIds);
  return readQueue().some((a) => {
    if ("deliveryRouteId" in a.payload && a.payload.deliveryRouteId === deliveryRouteId) return true;
    if ("routePointId" in a.payload && ids.has(a.payload.routePointId)) return true;
    return false;
  });
}

let flushing = false;

export async function flushQueue(): Promise<{ sent: number; failed: number }> {
  if (!isBrowser() || flushing || !isOnline()) return { sent: 0, failed: 0 };
  flushing = true;
  let sent = 0;
  let failed = 0;
  try {
    const items = readQueue();
    for (const action of items) {
      try {
        await executeAction(action);
        removeAction(action.id);
        sent++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const isNetwork = /network|fetch|failed to fetch|load failed|timeout/i.test(msg);
        if (isNetwork) break;
        // Бизнес-ошибка — удаляем, чтобы не зацикливаться
        console.warn("[offlineQueue] action failed permanently:", action.kind, msg);
        removeAction(action.id);
        failed++;
      }
    }
  } finally {
    flushing = false;
  }
  return { sent, failed };
}

async function executeAction(action: QueuedAction): Promise<void> {
  switch (action.kind) {
    case "advance_stage":
      await apiPost("/api/trip-stage/update", { kind: "advance", ...action.payload }, 10000);
      return;
    case "record_return":
      await apiPost("/api/trip-stage/update", { kind: "return", ...action.payload }, 10000);
      return;
    case "point_status_update": {
      const { routePointId, patch, parentRouteId } = action.payload;
      const { error } = await (supabase.from("route_points") as unknown as {
        update: (p: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: Error | null }> };
      }).update(patch).eq("id", routePointId);
      if (error) throw error;
      if (parentRouteId) {
        await supabase
          .from("delivery_routes")
          .update({ status: "in_progress" })
          .eq("id", parentRouteId)
          .eq("status", "issued");
      }
      return;
    }
    case "point_payment_update": {
      const { routePointId, orderId, orderUpdate, pointUpdate } = action.payload;
      if (Object.keys(orderUpdate).length > 0) {
        const { error: e1 } = await supabase.from("orders").update(orderUpdate).eq("id", orderId);
        if (e1) throw e1;
      }
      const { error: e2 } = await (supabase.from("route_points") as unknown as {
        update: (p: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: Error | null }> };
      }).update(pointUpdate).eq("id", routePointId);
      if (e2) throw e2;
      return;
    }
    case "log_point_action": {
      const p = action.payload;
      const { error } = await (supabase.from("route_point_actions" as never) as unknown as {
        insert: (p: Record<string, unknown>) => Promise<{ error: Error | null }>;
      }).insert({
        route_point_id: p.routePointId,
        order_id: p.orderId ?? null,
        route_id: p.routeId ?? null,
        action: p.action,
        actor: p.actor ?? "Водитель",
        details: p.details ?? {},
        comment: p.comment ?? null,
      });
      if (error) throw error;
      return;
    }
    case "route_finish": {
      const { error } = await supabase
        .from("delivery_routes")
        .update({ status: "completed" })
        .eq("id", action.payload.deliveryRouteId);
      if (error) throw error;
      return;
    }
  }
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

/** Универсальный helper: попытаться выполнить онлайн, иначе — поставить в очередь. */
export async function runWithOfflineFallback(
  kind: QueuedAction["kind"],
  payload: QueuedAction["payload"],
  online: () => Promise<void>,
): Promise<{ queued: boolean }> {
  if (!isOnline()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    enqueueAction(kind as any, payload as any);
    return { queued: true };
  }
  try {
    await online();
    return { queued: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/network|fetch|failed to fetch|load failed|timeout/i.test(msg)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      enqueueAction(kind as any, payload as any);
      return { queued: true };
    }
    throw e;
  }
}
