// Реестр адаптеров операторов ЭДО (новый контур отправки).
// Пока зарегистрирован только mock. Реальные операторы добавляются
// отдельными файлами без изменения UI и основного carrier-edo.server.ts.
import type { EdoOperatorAdapter, OperatorCode } from "./types";
import { mockOperatorAdapter } from "./mock-operator";

const REGISTRY: Partial<Record<OperatorCode, EdoOperatorAdapter>> = {
  internal_mock: mockOperatorAdapter,
};

/**
 * Возвращает адаптер по operator_code. Если оператор неизвестен или
 * ещё не реализован — возвращает mock-адаптер, чтобы UI не ломался.
 */
export function getOperatorAdapter(code: OperatorCode | string | null | undefined): EdoOperatorAdapter {
  const key = (code ?? "internal_mock") as OperatorCode;
  return REGISTRY[key] ?? mockOperatorAdapter;
}

export function isOperatorImplemented(code: OperatorCode | string | null | undefined): boolean {
  const key = (code ?? "internal_mock") as OperatorCode;
  return Boolean(REGISTRY[key]);
}
