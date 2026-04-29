export type DeliveryPointStatus =
  | "waiting"
  | "en_route"
  | "arrived"
  | "unloading"
  | "delivered"
  | "not_delivered"
  | "returned_to_warehouse";

export const DELIVERY_POINT_STATUS_ORDER: DeliveryPointStatus[] = [
  "waiting",
  "en_route",
  "arrived",
  "unloading",
  "delivered",
  "not_delivered",
  "returned_to_warehouse",
];

export const DELIVERY_POINT_STATUS_LABELS: Record<DeliveryPointStatus, string> = {
  waiting: "Ожидает",
  en_route: "В пути",
  arrived: "Прибыл",
  unloading: "Разгрузка",
  delivered: "Доставлено",
  not_delivered: "Не доставлено",
  returned_to_warehouse: "Возврат на склад",
};

export const DELIVERY_POINT_STATUS_STYLES: Record<DeliveryPointStatus, string> = {
  waiting: "border-muted-foreground/30 bg-muted text-muted-foreground",
  en_route: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  arrived: "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  unloading: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  delivered: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  not_delivered: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  returned_to_warehouse: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
};

export type DeliveryPointUndeliveredReason =
  | "client_absent"
  | "client_no_answer"
  | "no_payment"
  | "no_qr"
  | "client_refused"
  | "no_unloading"
  | "defective"
  | "damage"
  | "other";

export const DELIVERY_POINT_UNDELIVERED_REASON_ORDER: DeliveryPointUndeliveredReason[] = [
  "client_refused",
  "no_payment",
  "no_qr",
  "client_absent",
  "client_no_answer",
  "defective",
  "damage",
  "no_unloading",
  "other",
];

export const DELIVERY_POINT_UNDELIVERED_REASON_LABELS: Record<DeliveryPointUndeliveredReason, string> = {
  client_absent: "Клиента нет",
  client_no_answer: "Клиент не отвечает",
  no_payment: "Нет оплаты",
  no_qr: "Нет QR-кода",
  client_refused: "Отказ клиента",
  no_unloading: "Нет возможности выгрузки",
  defective: "Брак",
  damage: "Повреждение",
  other: "Другое",
};
