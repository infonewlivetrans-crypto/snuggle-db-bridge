// Словари статусов AI-диспетчера + русские лейблы + цвета бейджей.
// Статусы хранятся как text. Валидация — Zod на сервере.

export const CARRIER_STATUSES = [
  "new",
  "on_check",
  "ready_to_work",
  "missing_docs",
  "blocked",
  "archive",
] as const;
export type CarrierStatus = (typeof CARRIER_STATUSES)[number];

export const CARRIER_STATUS_LABELS: Record<CarrierStatus, string> = {
  new: "Новый",
  on_check: "На проверке",
  ready_to_work: "Готов к работе",
  missing_docs: "Не хватает документов",
  blocked: "Заблокирован",
  archive: "Архив",
};

export const DRIVER_STATUSES = [
  "new",
  "docs_unchecked",
  "ready_to_work",
  "free",
  "on_trip",
  "resting",
  "inactive",
  "blocked",
  "archive",
] as const;
export type DriverStatus = (typeof DRIVER_STATUSES)[number];

export const DRIVER_STATUS_LABELS: Record<DriverStatus, string> = {
  new: "Новый",
  docs_unchecked: "Документы не проверены",
  ready_to_work: "Готов к работе",
  free: "Свободен",
  on_trip: "В рейсе",
  resting: "Отдыхает",
  inactive: "Не работает",
  blocked: "Заблокирован",
  archive: "Архив",
};

export const VEHICLE_STATUSES = [
  "new",
  "docs_unchecked",
  "ready_to_work",
  "available",
  "partially_available",
  "waiting_freight",
  "offered",
  "busy",
  "on_trip",
  "unloading",
  "resting",
  "repair",
  "inactive",
  "blocked",
  "archive",
] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, string> = {
  new: "Новый",
  docs_unchecked: "Документы не проверены",
  ready_to_work: "Готов к работе",
  available: "Свободен",
  partially_available: "Частично свободен",
  waiting_freight: "Ждёт груз",
  offered: "Предложен груз",
  busy: "Занят",
  on_trip: "В рейсе",
  unloading: "На выгрузке",
  resting: "Отдыхает",
  repair: "В ремонте",
  inactive: "Неактивен",
  blocked: "Заблокирован",
  archive: "Архив",
};

// Состояние загрузки машины. Заполняет перевозчик/водитель.
export const LOAD_STATUSES = [
  "empty",
  "partial",
  "loaded",
  "unavailable",
  "repair",
  "resting",
] as const;
export type LoadStatus = (typeof LOAD_STATUSES)[number];

export const LOAD_STATUS_LABELS: Record<LoadStatus, string> = {
  empty: "Пустая",
  partial: "Нужен догруз",
  loaded: "Загружена",
  unavailable: "Недоступна",
  repair: "Ремонт",
  resting: "Отдых",
};

// Тип кузова. Стабильные коды + русские лейблы.
export const VEHICLE_BODY_TYPES = [
  "tent",
  "box",
  "refrigerator",
  "board",
  "flatbed",
  "container",
  "timber",
  "other",
] as const;
export type VehicleBodyType = (typeof VEHICLE_BODY_TYPES)[number];

export const VEHICLE_BODY_TYPE_LABELS: Record<VehicleBodyType, string> = {
  tent: "Тент",
  box: "Фургон",
  refrigerator: "Рефрижератор",
  board: "Бортовой",
  flatbed: "Шаланда",
  container: "Контейнеровоз",
  timber: "Лесовоз / коники",
  other: "Другое",
};

// Дополнительные признаки транспорта (хранятся в load_methods вместе со
// способами загрузки, т.к. это text[] без жёсткой схемы).
export const VEHICLE_FEATURES = [
  "sliding_roof",
  "removable_posts",
  "fixed_posts",
  "rings",
  "straps",
  "reinforced_floor",
] as const;
export type VehicleFeature = (typeof VEHICLE_FEATURES)[number];

export const VEHICLE_FEATURE_LABELS: Record<VehicleFeature, string> = {
  sliding_roof: "Верх откатной",
  removable_posts: "Съёмные стойки",
  fixed_posts: "Несъёмные стойки",
  rings: "Кольца",
  straps: "Ремни",
  reinforced_floor: "Усиленный пол",
};

// =============== Freights ===============
export const FREIGHT_STATUSES = [
  "new",
  "checking",
  "suitable",
  "offered",
  "booked",
  "rejected",
  "cancelled",
  "archived",
  "customer_called",
  "customer_ready",
  "not_suitable",
  "waiting_docs",
  "docs_received",
  "carrier_signing",
  "signed_sent",
  "deal_created",
  "taken_by_other",
  "not_actual",
  "no_answer",
  "bad_rate",
  "suspicious",
] as const;
export type FreightStatus = (typeof FREIGHT_STATUSES)[number];

export const FREIGHT_STATUS_LABELS: Record<FreightStatus, string> = {
  new: "Новый",
  checking: "Проверяем",
  suitable: "Подходит",
  offered: "Предложен",
  booked: "Забронирован",
  rejected: "Отклонён",
  cancelled: "Отменён",
  archived: "Архив",
  customer_called: "Заказчик прозвонен",
  customer_ready: "Заказчик готов заключить заявку",
  not_suitable: "Не подходит",
  waiting_docs: "Ждём заявку/договор",
  docs_received: "Документы получены",
  carrier_signing: "На подписи у перевозчика",
  signed_sent: "Подписанная заявка отправлена",
  deal_created: "Сделка создана",
  taken_by_other: "Груз уже забрали",
  not_actual: "Неактуален",
  no_answer: "Нет ответа",
  bad_rate: "Не подходит ставка",
  suspicious: "Сомнительный",
};

export const FREIGHT_INACTIVE_STATUSES = [
  "archived",
  "cancelled",
  "rejected",
  "not_suitable",
  "taken_by_other",
  "not_actual",
  "no_answer",
  "bad_rate",
  "suspicious",
] as const;


export const FREIGHT_SIGNED_SENT_CHANNELS = ["email", "messenger", "manual", "other"] as const;
export type FreightSignedSentChannel = (typeof FREIGHT_SIGNED_SENT_CHANNELS)[number];
export const FREIGHT_SIGNED_SENT_CHANNEL_LABELS: Record<FreightSignedSentChannel, string> = {
  email: "Email",
  messenger: "Мессенджер",
  manual: "Вручную",
  other: "Другое",
};

export const FREIGHT_KINDS = ["main", "additional"] as const;
export type FreightKind = (typeof FREIGHT_KINDS)[number];

export const FREIGHT_KIND_LABELS: Record<FreightKind, string> = {
  main: "Основной груз",
  additional: "Догруз",
};

export const FREIGHT_SOURCE_TYPES = [
  "manual",
  "email",
  "ati",
  "site",
  "messenger",
  "other",
] as const;
export type FreightSourceType = (typeof FREIGHT_SOURCE_TYPES)[number];

export const FREIGHT_SOURCE_TYPE_LABELS: Record<FreightSourceType, string> = {
  manual: "Вручную",
  email: "Почта",
  ati: "ATI",
  site: "Сайт",
  messenger: "Мессенджер",
  other: "Другое",
};

export const FREIGHT_PARSE_STATUSES = [
  "draft",
  "parsed",
  "needs_review",
  "converted",
  "archive",
] as const;
export type FreightParseStatus = (typeof FREIGHT_PARSE_STATUSES)[number];

export const FREIGHT_PARSE_STATUS_LABELS: Record<FreightParseStatus, string> = {
  draft: "Черновик",
  parsed: "Разобрано",
  needs_review: "Нужна проверка",
  converted: "Передано в работу",
  archive: "Архив",
};

/** Цвет бейджа по семантике статуса. */
export function statusBadgeClass(status: string): string {
  switch (status) {
    case "ready_to_work":
    case "free":
    case "available":
    case "suitable":
      return "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800";
    case "partially_available":
    case "on_check":
    case "docs_unchecked":
    case "waiting_freight":
    case "offered":
    case "checking":
      return "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800";
    case "on_trip":
    case "busy":
    case "unloading":
    case "booked":
      return "bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-800";
    case "resting":
    case "inactive":
    case "cancelled":
    case "repair":
      return "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700";
    case "missing_docs":
    case "blocked":
    case "rejected":
      return "bg-red-100 text-red-900 border-red-300 dark:bg-red-950 dark:text-red-200 dark:border-red-800";
    case "archive":
    case "archived":
      return "bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-900 dark:text-zinc-200 dark:border-zinc-700";
    case "new":
    default:
      return "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800";
  }
}

export const CARRIER_KINDS = [
  "individual_entrepreneur",
  "llc",
  "self_employed",
  "individual",
] as const;
export type CarrierKind = (typeof CARRIER_KINDS)[number];

export const CARRIER_KIND_LABELS: Record<CarrierKind, string> = {
  individual_entrepreneur: "ИП",
  llc: "ООО",
  self_employed: "Самозанятый",
  individual: "Физлицо",
};

// Налоговые режимы перевозчика. Технические value стабильны, русский — label.
export const CARRIER_TAX_REGIMES = [
  "osno",
  "usn_income",
  "usn_income_expense",
  "patent",
  "npd",
  "eshn",
] as const;
export type CarrierTaxRegime = (typeof CARRIER_TAX_REGIMES)[number];

export const CARRIER_TAX_REGIME_LABELS: Record<CarrierTaxRegime, string> = {
  osno: "ОСН",
  usn_income: "УСН (доходы)",
  usn_income_expense: "УСН (доходы − расходы)",
  patent: "Патент",
  npd: "НПД (самозанятый)",
  eshn: "ЕСХН",
};

export const LOAD_METHODS = ["back", "side", "top", "tail_lift"] as const;
export type LoadMethod = (typeof LOAD_METHODS)[number];

export const LOAD_METHOD_LABELS: Record<LoadMethod, string> = {
  back: "Задняя",
  side: "Боковая",
  top: "Верхняя",
  tail_lift: "Гидроборт",
};

// Способы оплаты перевозчику (Радиус Трек → перевозчик).
// Стабильные технические коды, русский текст только в label.
export const CARRIER_PAYMENT_METHODS = [
  "card",
  "bank_transfer",
  "card_or_bank",
  "by_agreement",
] as const;
export type CarrierPaymentMethod = (typeof CARRIER_PAYMENT_METHODS)[number];

export const CARRIER_PAYMENT_METHOD_LABELS: Record<CarrierPaymentMethod, string> = {
  card: "На карту",
  bank_transfer: "На расчётный счёт",
  card_or_bank: "Карта / расчётный счёт",
  by_agreement: "По договорённости",
};

// =============== Deals ===============
export const DEAL_STATUSES = [
  "draft",
  "offered",
  "agreed",
  "documents_sent",
  "customer_sent",
  "customer_confirmed",
  "loading",
  "in_transit",
  "unloading",
  "delivered",
  "waiting_payment",
  "waiting_customer_payment",
  "waiting_commission",
  "commission_received",
  "closed",
  "cancelled",
  "problem",
  "archived",
] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  draft: "Черновик",
  offered: "Предложено",
  agreed: "Согласовано",
  documents_sent: "Документы отправлены",
  customer_sent: "Данные заказчику отправлены",
  customer_confirmed: "Заказчик подтвердил",
  loading: "Загрузка",
  in_transit: "В рейсе",
  unloading: "Выгрузка",
  delivered: "Выгрузился",
  waiting_payment: "Ждём оплату",
  waiting_customer_payment: "Ждём оплату заказчика",
  waiting_commission: "Ждём комиссию",
  commission_received: "Комиссия получена",
  closed: "Закрыта",
  cancelled: "Отменена",
  problem: "Проблема",
  archived: "Архив",
};

export const PAYMENT_STATUSES = [
  "not_expected",
  "waiting_customer_payment",
  "customer_paid_carrier",
  "overdue",
  "dispute",
  "closed",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  not_expected: "Не ожидается",
  waiting_customer_payment: "Ждём оплату заказчика",
  customer_paid_carrier: "Перевозчик получил оплату",
  overdue: "Просрочено",
  dispute: "Спор",
  closed: "Закрыто",
};

export const COMMISSION_STATUSES = [
  "not_accrued",
  "accrued",
  "waiting_customer_payment",
  "waiting_commission",
  "commission_paid",
  "overdue",
  "dispute",
  "closed",
] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];

export const COMMISSION_STATUS_LABELS: Record<CommissionStatus, string> = {
  not_accrued: "Не начислена",
  accrued: "Начислена",
  waiting_customer_payment: "Ждём оплату заказчика",
  waiting_commission: "Ждём комиссию",
  commission_paid: "Комиссия получена",
  overdue: "Просрочено",
  dispute: "Спор",
  closed: "Закрыто",
};

// =============== Dispatcher payout (Stage 11.14) ===============
export const DISPATCHER_PAYOUT_STATUSES = [
  "pending",
  "ready",
  "paid",
  "held",
  "cancelled",
] as const;
export type DispatcherPayoutStatus = (typeof DISPATCHER_PAYOUT_STATUSES)[number];

export const DISPATCHER_PAYOUT_STATUS_LABELS: Record<DispatcherPayoutStatus, string> = {
  pending: "Ожидает",
  ready: "К выплате",
  paid: "Выплачено",
  held: "Удержано",
  cancelled: "Отменено",
};

export const PAYMENT_TYPES = [
  "cash",
  "card",
  "bank_transfer",
  "advance",
  "on_unload",
  "deferred",
  "other",
] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  cash: "Наличные",
  card: "Карта",
  bank_transfer: "Безнал",
  advance: "Аванс",
  on_unload: "По выгрузке",
  deferred: "С отсрочкой",
  other: "Другое",
};

// =============== Tasks ===============
export const TASK_TYPES = [
  "check_documents",
  "find_freight",
  "check_freight_matches",
  "create_deal",
  "call_driver",
  "call_carrier",
  "check_loading",
  "check_unloading",
  "check_customer_payment",
  "remind_commission",
  "overdue_commission",
  "close_deal",
  "custom",
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  check_documents: "Проверить документы",
  find_freight: "Найти груз",
  check_freight_matches: "Проверить машины под груз",
  create_deal: "Создать сделку",
  call_driver: "Позвонить водителю",
  call_carrier: "Позвонить перевозчику",
  check_loading: "Проверить загрузку",
  check_unloading: "Проверить выгрузку",
  check_customer_payment: "Проверить оплату",
  remind_commission: "Напомнить про комиссию",
  overdue_commission: "Просроченная комиссия",
  close_deal: "Закрыть сделку",
  custom: "Произвольная",
};

export const TASK_STATUSES = ["open", "in_progress", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  open: "Открыта",
  in_progress: "В работе",
  done: "Выполнена",
  cancelled: "Отменена",
};

export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Низкий",
  normal: "Обычный",
  high: "Высокий",
  urgent: "Срочно",
};

export const RELATED_ENTITY_TYPES = [
  "carrier",
  "driver",
  "vehicle",
  "freight",
  "deal",
  "commission",
  "none",
] as const;
export type RelatedEntityType = (typeof RELATED_ENTITY_TYPES)[number];

export const RELATED_ENTITY_LABELS: Record<RelatedEntityType, string> = {
  carrier: "Перевозчик",
  driver: "Водитель",
  vehicle: "Машина",
  freight: "Груз",
  deal: "Сделка",
  commission: "Комиссия",
  none: "—",
};

export function relatedEntityRoute(t: RelatedEntityType | string | null | undefined): string {
  switch (t) {
    case "vehicle":
      return "/dispatcher/vehicles";
    case "freight":
      return "/dispatcher/freights";
    case "deal":
      return "/dispatcher/deals";
    case "commission":
      return "/dispatcher/commissions";
    case "driver":
      return "/dispatcher/drivers";
    case "carrier":
      return "/dispatcher/carriers";
    default:
      return "/dispatcher";
  }
}

export function taskPriorityBadgeClass(p: string): string {
  switch (p) {
    case "urgent":
      return "bg-red-100 text-red-900 border-red-300 dark:bg-red-950 dark:text-red-200 dark:border-red-800";
    case "high":
      return "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800";
    case "low":
      return "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700";
    case "normal":
    default:
      return "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800";
  }
}

export function taskStatusBadgeClass(s: string): string {
  switch (s) {
    case "done":
      return "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800";
    case "in_progress":
      return "bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-800";
    case "cancelled":
      return "bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-900 dark:text-zinc-200 dark:border-zinc-700";
    case "open":
    default:
      return "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800";
  }
}

// =============== Partner card sends ===============
export const PARTNER_CARD_SEND_CHANNELS = [
  "manual",
  "email",
  "whatsapp",
  "telegram",
  "max",
  "phone",
  "other",
] as const;
export type PartnerCardSendChannel = (typeof PARTNER_CARD_SEND_CHANNELS)[number];

export const PARTNER_CARD_SEND_CHANNEL_LABELS: Record<PartnerCardSendChannel, string> = {
  manual: "Вручную",
  email: "Email",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  max: "Max",
  phone: "Телефон",
  other: "Другое",
};

export const PARTNER_CARD_SEND_STATUSES = [
  "draft",
  "copied",
  "sent",
  "cancelled",
  "archive",
] as const;
export type PartnerCardSendStatus = (typeof PARTNER_CARD_SEND_STATUSES)[number];

export const PARTNER_CARD_SEND_STATUS_LABELS: Record<PartnerCardSendStatus, string> = {
  draft: "Черновик",
  copied: "Скопировано",
  sent: "Отправлено",
  cancelled: "Отменено",
  archive: "Архив",
};

// =============== Carrier requests ===============
export const CARRIER_REQUEST_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "accepted",
  "declined",
  "cancelled",
  "archive",
] as const;
export type CarrierRequestStatus = (typeof CARRIER_REQUEST_STATUSES)[number];

export const CARRIER_REQUEST_STATUS_LABELS: Record<CarrierRequestStatus, string> = {
  draft: "Черновик",
  sent: "Отправлена перевозчику",
  viewed: "Просмотрена",
  accepted: "Принята",
  declined: "Отклонена",
  cancelled: "Отменена",
  archive: "Архив",
};

export const CARRIER_REQUEST_PAYMENT_TYPES = [
  "prepayment",
  "on_loading",
  "on_unloading",
  "delayed",
  "mixed",
  "other",
] as const;
export type CarrierRequestPaymentType = (typeof CARRIER_REQUEST_PAYMENT_TYPES)[number];

export const CARRIER_REQUEST_PAYMENT_TYPE_LABELS: Record<CarrierRequestPaymentType, string> = {
  prepayment: "Предоплата",
  on_loading: "На загрузке",
  on_unloading: "На выгрузке",
  delayed: "Отсрочка",
  mixed: "Смешанная",
  other: "Другое",
};


// Часто используемые города для combobox/datalist.
export const RUSSIAN_CITIES_PRESET = [
  "Краснодар",
  "Москва",
  "Санкт-Петербург",
  "Ростов-на-Дону",
  "Ставрополь",
  "Новороссийск",
  "Армавир",
  "Майкоп",
  "Волгоград",
  "Екатеринбург",
  "Новосибирск",
  "Казань",
  "Нижний Новгород",
  "Самара",
  "Уфа",
  "Челябинск",
  "Воронеж",
  "Пермь",
] as const;

// =============== Dispatcher work status (Stage 11.19) ===============
// Состояние работы диспетчера с машиной: кто взял в работу, на каком этапе.
export const DISPATCHER_WORK_STATUSES = [
  "free",
  "in_work",
  "offered",
  "accepted",
  "declined",
  "released",
] as const;
export type DispatcherWorkStatus = (typeof DISPATCHER_WORK_STATUSES)[number];

export const DISPATCHER_WORK_STATUS_LABELS: Record<DispatcherWorkStatus, string> = {
  free: "Свободна",
  in_work: "В работе у диспетчера",
  offered: "Предложение отправлено",
  accepted: "Принято перевозчиком",
  declined: "Отклонено перевозчиком",
  released: "Освобождена",
};
