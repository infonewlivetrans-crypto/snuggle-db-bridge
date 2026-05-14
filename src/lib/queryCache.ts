/**
 * Единые TTL для кешей React Query.
 *
 * Идея:
 *  - справочники/настройки живут долго (редко меняются);
 *  - бизнес-данные (заказы, маршруты, склад, отчёты) — короче;
 *  - уведомления — почти онлайн.
 *
 * Эти константы используются как `staleTime` в useQuery,
 * чтобы при повторном открытии страницы данные показывались
 * мгновенно из кеша, а сеть подтягивалась в фоне.
 */
export const CACHE_TIMES = {
  /** Справочники, словари, настройки — 30 минут. */
  REFERENCE: 30 * 60_000,
  /** Долгие справочники (тарифы, роли) — 60 минут. */
  REFERENCE_LONG: 60 * 60_000,
  /** Заказы, маршруты, склад, отчёты — 2 минуты. */
  BUSINESS: 2 * 60_000,
  /** Короткие списки в реальном времени (фид заявок) — 1 минута. */
  BUSINESS_SHORT: 60_000,
  /** Уведомления — 30 секунд. */
  NOTIFICATIONS: 30_000,
} as const;

/**
 * Префиксы queryKey, которые НЕ сохраняем в localStorage:
 * содержат потенциально чувствительные данные авторизации
 * либо realtime/live-стримы, которые бессмысленно персистить.
 */
export const NON_PERSISTED_KEY_PREFIXES = [
  "realtime:",
  "live:",
  "auth:",
  "session:",
  "token:",
] as const;

export function isPersistableQueryKey(key: readonly unknown[]): boolean {
  return !key.some(
    (k) =>
      typeof k === "string" &&
      NON_PERSISTED_KEY_PREFIXES.some((p) => k.startsWith(p)),
  );
}
