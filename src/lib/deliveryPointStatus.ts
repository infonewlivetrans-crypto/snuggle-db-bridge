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
  | "wrong_address"
  | "other";

export const DELIVERY_POINT_UNDELIVERED_REASON_ORDER: DeliveryPointUndeliveredReason[] = [
  "client_no_answer",
  "client_absent",
  "no_payment",
  "no_qr",
  "client_refused",
  "no_unloading",
  "no_unloading",
  "damage",
  "other",
];

// Быстрые шаблоны причин для статуса «Не доставлено» (по ТЗ)
export const DELIVERY_POINT_NOT_DELIVERED_REASONS: DeliveryPointUndeliveredReason[] = [
  "client_no_answer",
  "client_absent",
  "no_payment",
  "no_qr",
  "client_refused",
  "no_unloading",
  "damage",
  "other",
];

// Быстрые шаблоны причин для статуса «Возврат на склад» (по ТЗ)
export const DELIVERY_POINT_RETURN_REASONS: DeliveryPointUndeliveredReason[] = [
  "client_refused",
  "no_payment",
  "no_qr",
  "defective",
  "damage",
  "no_unloading",
  "wrong_address",
  "other",
];

export const DELIVERY_POINT_UNDELIVERED_REASON_LABELS: Record<DeliveryPointUndeliveredReason, string> = {
  client_absent: "Клиента нет на месте",
  client_no_answer: "Клиент не отвечает",
  no_payment: "Нет оплаты",
  no_qr: "Нет QR-кода",
  client_refused: "Клиент отказался",
  no_unloading: "Нет возможности подъезда / выгрузки",
  defective: "Брак",
  damage: "Повреждение",
  wrong_address: "Неверный адрес",
  other: "Другое",
};

// Шаблоны комментариев водителя для каждой причины
export const DELIVERY_POINT_REASON_COMMENT_TEMPLATES: Record<DeliveryPointUndeliveredReason, string[]> = {
  client_no_answer: [
    "Звонил несколько раз — клиент не отвечает.",
    "Телефон выключен или вне зоны.",
  ],
  client_absent: [
    "Приехал на адрес — клиента нет на месте.",
    "Никого нет, дверь закрыта.",
  ],
  no_payment: [
    "Клиент не готов оплатить сейчас.",
    "Просит выставить счёт безналом.",
  ],
  no_qr: [
    "Клиент не предоставил QR-код маркетплейса.",
    "QR-код не сгенерирован у клиента.",
  ],
  client_refused: [
    "Клиент отказался от заказа без объяснения причин.",
    "Передумал — отказ от приёмки.",
  ],
  no_unloading: [
    "Нет подъезда к разгрузке.",
    "Нет грузчиков для выгрузки.",
  ],
  defective: [
    "Обнаружен брак товара при приёмке.",
    "Заводской брак — клиент не принимает.",
  ],
  damage: [
    "Повреждение товара при транспортировке.",
    "Упаковка повреждена, клиент не принимает.",
  ],
  wrong_address: [
    "Адрес указан неверно — по факту другой объект.",
    "Клиент не находится по указанному адресу.",
  ],
  other: [
    "Другое — см. комментарий ниже.",
  ],
};
