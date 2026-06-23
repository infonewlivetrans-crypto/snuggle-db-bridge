// Дополнительный реестр серверных адаптеров операторов ЭДО (нового контура отправки).
// Это отдельный слой от src/server/edo/providers — он принимает operator_code и
// возвращает адаптер из mock-семейства. Saby здесь представлен как saby-tms.
import type { EdoOperatorAdapter, OperatorCode } from "./types";
import { mockOperatorAdapter } from "./mock-operator";
import { sabyOperatorAdapter } from "./saby-tms";

const REGISTRY: Partial<Record<OperatorCode, EdoOperatorAdapter>> = {
  internal_mock: mockOperatorAdapter,
  saby_tms: sabyOperatorAdapter,
};

export function getOperatorAdapter(code: OperatorCode | string | null | undefined): EdoOperatorAdapter {
  const key = (code ?? "internal_mock") as OperatorCode;
  return REGISTRY[key] ?? mockOperatorAdapter;
}

export function isOperatorImplemented(code: OperatorCode | string | null | undefined): boolean {
  const key = (code ?? "internal_mock") as OperatorCode;
  return Boolean(REGISTRY[key]);
}
