// Client-safe types/constants for EPD route changes.
// Do NOT import server-only code here.

export const CHANGE_TYPES = [
  "driver_change",
  "vehicle_change",
  "trailer_change",
  "unload_point_change",
  "redirect",
  "rate_change",
  "payment_terms_change",
  "load_datetime_change",
  "unload_datetime_change",
  "trip_cancel",
  "order_recall",
  "other",
] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

export const CHANGE_TYPE_LABEL: Record<ChangeType, string> = {
  driver_change: "Смена водителя",
  vehicle_change: "Смена транспортного средства",
  trailer_change: "Смена прицепа",
  unload_point_change: "Изменение точки выгрузки",
  redirect: "Переадресация",
  rate_change: "Изменение стоимости перевозки",
  payment_terms_change: "Изменение условий оплаты",
  load_datetime_change: "Изменение даты/времени погрузки",
  unload_datetime_change: "Изменение даты/времени выгрузки",
  trip_cancel: "Отмена рейса",
  order_recall: "Отзыв поручения",
  other: "Другое",
};

export const CHANGE_STATUSES = [
  "draft",
  "requested",
  "approved",
  "rejected",
  "sent_to_operator_mock",
  "completed_mock",
  "failed_mock",
] as const;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];

export const CHANGE_STATUS_LABEL: Record<ChangeStatus, string> = {
  draft: "Черновик",
  requested: "Запрошено",
  approved: "Согласовано",
  rejected: "Отклонено",
  sent_to_operator_mock: "Отправлено оператору (mock)",
  completed_mock: "Выполнено (mock)",
  failed_mock: "Ошибка (mock)",
};
