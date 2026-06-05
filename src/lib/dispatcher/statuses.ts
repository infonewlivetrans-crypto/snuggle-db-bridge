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
  "available",
  "waiting_freight",
  "offered",
  "on_trip",
  "unloading",
  "resting",
  "inactive",
  "blocked",
  "archive",
] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, string> = {
  new: "Новый",
  docs_unchecked: "Документы не проверены",
  available: "Свободен",
  waiting_freight: "Ждёт груз",
  offered: "Предложен груз",
  on_trip: "В рейсе",
  unloading: "На выгрузке",
  resting: "Отдыхает",
  inactive: "Не работает",
  blocked: "Заблокирован",
  archive: "Архив",
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
] as const;
export type FreightStatus = (typeof FREIGHT_STATUSES)[number];

export const FREIGHT_STATUS_LABELS: Record<FreightStatus, string> = {
  new: "Новый",
  checking: "Проверяется",
  suitable: "Подходит",
  offered: "Предложен",
  booked: "Забронирован",
  rejected: "Отклонён",
  cancelled: "Отменён",
  archived: "Архив",
};

export const FREIGHT_KINDS = ["main", "additional"] as const;
export type FreightKind = (typeof FREIGHT_KINDS)[number];

export const FREIGHT_KIND_LABELS: Record<FreightKind, string> = {
  main: "Основной груз",
  additional: "Догруз",
};

/** Цвет бейджа по семантике статуса. */
export function statusBadgeClass(status: string): string {
  switch (status) {
    case "ready_to_work":
    case "free":
    case "available":
    case "suitable":
      return "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800";
    case "on_check":
    case "docs_unchecked":
    case "waiting_freight":
    case "offered":
    case "checking":
      return "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800";
    case "on_trip":
    case "unloading":
    case "booked":
      return "bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-800";
    case "resting":
    case "inactive":
    case "cancelled":
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

export const LOAD_METHODS = ["back", "side", "top", "tail_lift"] as const;
export type LoadMethod = (typeof LOAD_METHODS)[number];

export const LOAD_METHOD_LABELS: Record<LoadMethod, string> = {
  back: "Задняя",
  side: "Боковая",
  top: "Верхняя",
  tail_lift: "Гидроборт",
};

// =============== Deals ===============
export const DEAL_STATUSES = [
  "draft",
  "offered",
  "agreed",
  "documents_sent",
  "loading",
  "in_transit",
  "unloading",
  "delivered",
  "waiting_payment",
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
  loading: "Загрузка",
  in_transit: "В рейсе",
  unloading: "Выгрузка",
  delivered: "Выгрузился",
  waiting_payment: "Ждём оплату",
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
