// Унифицированная упрощённая модель «готовности машины».
// Используется новым компонентом VehicleReadinessEditor и для отображения
// человеко-понятной сводки на карточках машины.
//
// Внутри БД ничего не меняется: храним всё в существующих полях
// load_status / ready_mode / ready_from / ready_date / ready_radius_km /
// ready_to_cities / current_city. Эта обёртка лишь объединяет UI-вариант
// «Готов сейчас / сегодня / завтра / с даты / Не готов» с этими полями.

import type { LoadStatus, VehicleReadyMode } from "@/lib/dispatcher/statuses";

export type SimpleReadyMode =
  | "now"
  | "today"
  | "tomorrow"
  | "from_date"
  | "not_ready";

export const SIMPLE_READY_MODES: SimpleReadyMode[] = [
  "now",
  "today",
  "tomorrow",
  "from_date",
  "not_ready",
];

export const SIMPLE_READY_MODE_LABELS: Record<SimpleReadyMode, string> = {
  now: "Готов сейчас",
  today: "Готов сегодня",
  tomorrow: "Готов завтра",
  from_date: "Готов с даты",
  not_ready: "Не готов",
};

export interface ReadinessFields {
  load_status?: string | null;
  ready_mode?: string | null;
  ready_from?: string | null;
  ready_date?: string | null;
  ready_radius_km?: number | null;
  ready_to_cities?: string[] | null;
  current_city?: string | null;
}

/** Определяет упрощённый режим из текущего набора полей машины. */
export function deriveSimpleMode(v: ReadinessFields): SimpleReadyMode {
  if (v.load_status === "unavailable" || v.load_status === "repair" || v.load_status === "resting") {
    return "not_ready";
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const isSameDay = (d: string | null | undefined, target: Date) => {
    if (!d) return false;
    const x = new Date(d);
    return (
      x.getFullYear() === target.getFullYear() &&
      x.getMonth() === target.getMonth() &&
      x.getDate() === target.getDate()
    );
  };
  if (v.ready_mode === "from_date" && v.ready_from) {
    if (isSameDay(v.ready_from, tomorrow)) return "tomorrow";
    const x = new Date(v.ready_from);
    if (x.getTime() <= today.getTime()) return "today";
    return "from_date";
  }
  if (v.ready_mode === "today") return "today";
  if (v.ready_mode === "always") return "now";
  if (v.ready_date && isSameDay(v.ready_date, tomorrow)) return "tomorrow";
  if (v.ready_date && isSameDay(v.ready_date, today)) return "today";
  return "now";
}

/** Превращает упрощённый выбор в патч для PATCH-эндпоинта машины. */
export function simpleModeToPatch(
  mode: SimpleReadyMode,
  fromDate?: string | null,
): {
  load_status: LoadStatus;
  ready_mode: VehicleReadyMode | null;
  ready_from: string | null;
  ready_date: string | null;
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  switch (mode) {
    case "now":
      return { load_status: "empty", ready_mode: "always", ready_from: null, ready_date: null };
    case "today":
      return { load_status: "empty", ready_mode: "today", ready_from: null, ready_date: iso(today) };
    case "tomorrow":
      return {
        load_status: "empty",
        ready_mode: "from_date",
        ready_from: iso(tomorrow),
        ready_date: iso(tomorrow),
      };
    case "from_date":
      return {
        load_status: "empty",
        ready_mode: "from_date",
        ready_from: fromDate || iso(tomorrow),
        ready_date: fromDate || iso(tomorrow),
      };
    case "not_ready":
      return { load_status: "unavailable", ready_mode: null, ready_from: null, ready_date: null };
  }
}

export const RADIUS_PRESETS: ReadonlyArray<{ value: number | null; label: string }> = [
  { value: 50, label: "50 км" },
  { value: 100, label: "100 км" },
  { value: 200, label: "200 км" },
  { value: 500, label: "500 км" },
  { value: null, label: "Любой" },
];

/** Основные крупные направления для чекбоксов. Подмножество RUSSIA_ZONES. */
export const BIG_DIRECTIONS: ReadonlyArray<string> = [
  "Москва и область",
  "Санкт-Петербург и область",
  "Центр",
  "Юг",
  "Поволжье",
  "Урал",
  "Сибирь",
  "Кавказ",
  "Любое направление",
];

/** Популярные города для быстрого выбора текущего города. */
export const POPULAR_CITIES: ReadonlyArray<string> = [
  "Краснодар",
  "Ростов-на-Дону",
  "Москва",
  "Санкт-Петербург",
  "Саратов",
  "Волгоград",
  "Воронеж",
  "Нижний Новгород",
  "Казань",
  "Самара",
  "Екатеринбург",
  "Новосибирск",
];

/** Человеко-понятная итоговая строка. */
export function summarizeReadiness(v: ReadinessFields & {
  is_active?: boolean | null;
  dispatcher_status?: string | null;
  driver_id?: string | null;
  dispatcher_driver_ext_id?: string | null;
}): string {
  if (v.dispatcher_status === "archive") return "Машина в архиве.";
  if (v.dispatcher_status === "blocked") return "Машина заблокирована.";
  if (v.is_active === false) return "Машина неактивна.";
  const mode = deriveSimpleMode(v);
  if (mode === "not_ready") return "Машина сейчас не готова к работе.";
  const driver = v.driver_id || v.dispatcher_driver_ext_id;
  if (!v.current_city || !driver) {
    return "Чтобы машина появилась на карте, укажите текущий город, готовность и водителя.";
  }
  const parts: string[] = ["Машина свободна"];
  parts.push(`город ${v.current_city}`);
  parts.push(SIMPLE_READY_MODE_LABELS[mode].toLowerCase());
  if (v.ready_radius_km != null) parts.push(`радиус ${v.ready_radius_km} км`);
  const dirs = (v.ready_to_cities ?? []).filter(Boolean);
  if (dirs.length) parts.push(`готова ехать: ${dirs.join(", ")}`);
  return parts.join(", ") + ".";
}
