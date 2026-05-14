/**
 * Окна загрузки/приёмки на складе (dock slots).
 *
 * Используются начальником склада для:
 * - графика отгрузок машин с маршрутами,
 * - графика приёма товара с завода,
 * - графика приёма возврата с маршрута.
 */

export type DockSlotKind = "shipment" | "inbound_factory" | "inbound_return";

export type DockSlotStatus =
  | "planned"
  | "arrived"
  | "loading"
  | "loaded"
  | "done"
  | "cancelled";

export const DOCK_SLOT_KIND_LABELS: Record<DockSlotKind, string> = {
  shipment: "Отгрузка маршрута",
  inbound_factory: "Приёмка с завода",
  inbound_return: "Приёмка возврата",
};

export const DOCK_SLOT_KIND_SHORT: Record<DockSlotKind, string> = {
  shipment: "Отгрузка",
  inbound_factory: "С завода",
  inbound_return: "Возврат",
};

export const DOCK_SLOT_STATUS_LABELS: Record<DockSlotStatus, string> = {
  planned: "Запланировано",
  arrived: "Машина прибыла",
  loading: "Идёт загрузка",
  loaded: "Загружено",
  done: "Выполнено",
  cancelled: "Отменено",
};

/** Соответствие статуса слота → бейдж дизайн-кита */
export const DOCK_SLOT_STATUS_BADGE: Record<DockSlotStatus, string> = {
  planned: "badge-status-new",
  arrived: "badge-status-progress",
  loading: "badge-status-progress",
  loaded: "badge-status-delivering",
  done: "badge-status-completed",
  cancelled: "badge-status-cancelled",
};

export type DockSlot = {
  id: string;
  warehouse_id: string;
  slot_kind: DockSlotKind;
  slot_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM(:SS)
  end_time: string | null;
  route_id: string | null;
  vehicle_id: string | null;
  driver_id: string | null;
  carrier_name: string | null;
  driver_name: string | null;
  vehicle_plate: string | null;
  cargo_summary: string | null;
  expected_arrival_at: string | null;
  status: DockSlotStatus;
  arrived_at: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/** Сегодняшняя дата в формате YYYY-MM-DD (локальная) */
export function todayDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Округление времени HH:MM:SS → HH:MM для отображения */
export function shortTime(t: string | null | undefined): string {
  if (!t) return "—";
  return t.slice(0, 5);
}

/**
 * Считает оставшееся время до прибытия в формате "Xч Yм" / "через 12 мин" / "опоздал на 5 мин".
 * Возвращает компоненты для гибкой отрисовки.
 */
export function eta(expected: string | null | undefined, now: Date = new Date()) {
  if (!expected) return { label: "—", minutes: null as number | null, late: false };
  const target = new Date(expected).getTime();
  const diffMin = Math.round((target - now.getTime()) / 60_000);
  if (diffMin === 0) return { label: "сейчас", minutes: 0, late: false };
  if (diffMin > 0) {
    if (diffMin < 60) return { label: `через ${diffMin} мин`, minutes: diffMin, late: false };
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    return { label: `через ${h}ч ${m}м`, minutes: diffMin, late: false };
  }
  const lateMin = Math.abs(diffMin);
  if (lateMin < 60) return { label: `опоздание ${lateMin} мин`, minutes: -lateMin, late: true };
  const h = Math.floor(lateMin / 60);
  const m = lateMin % 60;
  return { label: `опоздание ${h}ч ${m}м`, minutes: -lateMin, late: true };
}
