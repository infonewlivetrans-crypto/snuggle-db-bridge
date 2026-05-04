// Клиент-безопасные константы и типы для исключений заказов из рейса.
export const EXCLUSION_REASONS = [
  "Не влез",
  "Отменился",
  "Нет на складе",
  "Повреждён",
  "Перенос доставки",
  "Другая причина",
] as const;
export type ExclusionReason = (typeof EXCLUSION_REASONS)[number];

export type RouteExclusionRow = {
  id: string;
  delivery_route_id: string;
  route_id: string | null;
  order_id: string;
  reason: string;
  comment: string | null;
  excluded_by: string | null;
  excluded_by_name: string | null;
  excluded_at: string;
};
