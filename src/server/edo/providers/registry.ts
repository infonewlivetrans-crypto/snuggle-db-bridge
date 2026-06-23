// Реестр операторов ЭДО. Единая точка получения адаптера по коду провайдера.
import type { EdoProvider, EdoProviderAdapter } from "./types";
import { internalMockAdapter } from "./internal-mock";
import { diadocAdapter } from "./diadoc";
import { sbisAdapter } from "./sbis";
import { taxcomAdapter } from "./taxcom";
import { astralAdapter } from "./astral";
import { sberkorusAdapter } from "./sberkorus";
import { otherAdapter } from "./other";
import { sabyTmsAdapter } from "./saby-tms";

const REGISTRY: Record<EdoProvider, EdoProviderAdapter> = {
  diadoc: diadocAdapter,
  sbis: sbisAdapter,
  taxcom: taxcomAdapter,
  astral: astralAdapter,
  sberkorus: sberkorusAdapter,
  saby_tms: sabyTmsAdapter,
  other: otherAdapter,
  internal_mock: internalMockAdapter,
};

export function getEdoAdapter(provider: EdoProvider): EdoProviderAdapter {
  return REGISTRY[provider] ?? internalMockAdapter;
}

export const EDO_PROVIDERS: { value: EdoProvider; label: string }[] = [
  { value: "diadoc", label: "Контур Диадок" },
  { value: "sbis", label: "СБИС" },
  { value: "taxcom", label: "Такском" },
  { value: "astral", label: "Калуга Астрал" },
  { value: "sberkorus", label: "СберКорус" },
  { value: "saby_tms", label: "Saby TMS" },
  { value: "other", label: "Другой оператор" },
  { value: "internal_mock", label: "Внутренний режим Радиус Трек" },
];
