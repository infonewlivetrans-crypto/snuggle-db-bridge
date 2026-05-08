// Серверные проверки feature flags.
//
// Источник правды — реестр FEATURE_FLAGS (in-memory, defaultEnabled).
// База не меняется. Этот модуль предоставляет helper'ы для безопасной
// защиты server functions / server routes без поломки маршрутов:
//   - isFeatureEnabledServer(key) — синхронная проверка по реестру.
//   - requireFeature(key) — бросает FeatureDisabledError, если фича выкл.
//   - withFeature(key, handler, fallback) — обёртка для server route handlers,
//     возвращающая нейтральный 200-ответ при выключенной фиче.
//   - createFeatureMiddleware(key, fallback) — middleware для createServerFn.
//
// Поведение по умолчанию при выключенной фиче: HTTP 200 + нейтральный JSON
// { ok: true, disabled: true, feature: <key>, data: <fallback?> }.
// Это сознательный выбор: существующие клиенты не падают на ошибках,
// просто получают пустой/нейтральный ответ.

import { FEATURE_FLAGS_BY_KEY } from "./feature-flags";

export class FeatureDisabledError extends Error {
  readonly feature: string;
  constructor(feature: string) {
    super(`Feature "${feature}" is disabled`);
    this.name = "FeatureDisabledError";
    this.feature = feature;
  }
}

/**
 * Проверяет, включена ли фича на сервере.
 * Сейчас читает только из in-memory реестра (defaultEnabled).
 * Если в будущем появится таблица feature_flags — расширить здесь,
 * не меняя сигнатуру и не ломая вызывающий код.
 */
export function isFeatureEnabledServer(key: string): boolean {
  const def = FEATURE_FLAGS_BY_KEY[key];
  if (!def) {
    // Неизвестный ключ — безопасно считаем выключенным.
    return false;
  }
  return def.defaultEnabled === true;
}

/**
 * Бросает FeatureDisabledError, если фича выключена.
 * Используется внутри createServerFn handler'ов, когда логика
 * не имеет смысла без фичи.
 */
export function requireFeature(key: string): void {
  if (!isFeatureEnabledServer(key)) {
    throw new FeatureDisabledError(key);
  }
}

/**
 * Стандартный нейтральный ответ при выключенной фиче.
 * 200 + JSON, чтобы не ломать клиентов, которые ожидают успешный ответ.
 */
export function featureDisabledResponse(
  key: string,
  fallbackData?: unknown,
): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      disabled: true,
      feature: key,
      data: fallbackData ?? null,
      message: `Feature "${key}" is currently disabled`,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Feature-Disabled": key,
      },
    },
  );
}

/**
 * Обёртка для server route handler. Если фича выключена — возвращает
 * нейтральный 200-ответ, не вызывая handler. Иначе — пробрасывает вызов.
 *
 * Пример:
 *   export const Route = createFileRoute("/api/some")({
 *     server: {
 *       handlers: {
 *         GET: withFeature("driver.offline_mode", async (ctx) => { ... }),
 *       },
 *     },
 *   });
 */
export function withFeature<TCtx, TRes extends Response>(
  key: string,
  handler: (ctx: TCtx) => Promise<TRes> | TRes,
  fallbackData?: unknown,
): (ctx: TCtx) => Promise<Response> {
  return async (ctx: TCtx) => {
    if (!isFeatureEnabledServer(key)) {
      return featureDisabledResponse(key, fallbackData);
    }
    return handler(ctx);
  };
}

/**
 * Универсальный безопасный результат для server functions.
 * Возвращает либо результат handler'а, либо нейтральный объект-заглушку.
 *
 * Пример:
 *   export const fn = createServerFn({ method: "GET" })
 *     .handler(async () =>
 *       runIfFeatureEnabled("ai.route_suggestions", async () => {
 *         return { suggestions: await compute() };
 *       }, { suggestions: [] }),
 *     );
 */
export async function runIfFeatureEnabled<T>(
  key: string,
  handler: () => Promise<T> | T,
  fallback: T,
): Promise<T> {
  if (!isFeatureEnabledServer(key)) {
    return fallback;
  }
  return handler();
}
