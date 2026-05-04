// Этапы рейса водителя — параллельный трек к статусу маршрута логиста.

export type TripStage =
  | "not_started"
  | "arrived_loading"
  | "loaded"
  | "departed"
  | "in_progress"
  | "finished"
  | "cash_returned";

export const TRIP_STAGE_LABELS: Record<TripStage, string> = {
  not_started: "Не начат",
  arrived_loading: "Прибыл на загрузку",
  loaded: "Загрузился",
  departed: "Выехал на линию",
  in_progress: "Выполняет маршрут",
  finished: "Завершил рейс",
  cash_returned: "Вернул деньги / закрыл кассу",
};

// Шаги, которые видны и нажимаются водителем по очереди.
// `in_progress` ставится автоматически после `departed`, отдельной кнопки нет.
export const TRIP_STAGE_STEPS: TripStage[] = [
  "arrived_loading",
  "loaded",
  "departed",
  "finished",
  "cash_returned",
];

export const TRIP_STAGE_TIMESTAMP_FIELD: Record<TripStage, string | null> = {
  not_started: null,
  arrived_loading: "arrived_loading_at",
  loaded: "loaded_at",
  departed: "departed_at",
  in_progress: null,
  finished: "finished_at",
  cash_returned: "cash_returned_at",
};

// Возвращает следующий шаг, который должен нажать водитель.
export function nextStage(current: TripStage): TripStage | null {
  if (current === "not_started") return "arrived_loading";
  if (current === "arrived_loading") return "loaded";
  if (current === "loaded") return "departed";
  if (current === "departed" || current === "in_progress") return "finished";
  if (current === "finished") return "cash_returned";
  return null;
}

// При активации этапа — на какое значение менять current_stage в БД.
export function applyStage(target: TripStage): TripStage {
  // departed автоматически переходит в in_progress
  if (target === "departed") return "in_progress";
  return target;
}
