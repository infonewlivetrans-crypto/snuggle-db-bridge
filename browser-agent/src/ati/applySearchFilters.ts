// Заполнение формы поиска ATI из ati_filters_json.
// Только видимые поля. Не отправляет форму, если обязательные поля не заполнены.
import { FORM_FIELDS, findFieldElement, type FieldStrategy } from "./formSelectors";
import { setInputValue } from "./setInputValue";
import { selectComboOption, selectNativeOption } from "./selectOption";
import { collectFormDiagnostics, type FormDiagnostics } from "./formDiagnostics";

export interface AtiFilters {
  pickup_city?: string;
  pickup_radius_km?: number;
  delivery_city?: string;
  delivery_radius_km?: number;
  distance_min_km?: number;
  distance_max_km?: number;
  weight?: number;
  volume?: number;
  pickup_date?: string;
  body_type?: string;
  loading_type?: string;
  payment_type?: string;
  price_min?: number;
  price_per_km_min?: number;
  [k: string]: unknown;
}

export interface ApplyFiltersResult {
  success: boolean;
  appliedFields: string[];
  failedFields: Array<{ field: string; reason: string }>;
  missingFields: string[];
  diagnostics: FormDiagnostics;
}

function applyOne(strategy: FieldStrategy, value: unknown): { ok: boolean; reason?: string } {
  const el = findFieldElement(strategy);
  if (!el) return { ok: false, reason: "element_not_found" };
  const strValue = String(value ?? "").trim();
  if (!strValue) return { ok: false, reason: "empty_value" };
  try {
    if (el instanceof HTMLSelectElement) {
      return selectNativeOption(el, strValue) ? { ok: true } : { ok: false, reason: "option_not_found" };
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      if (strategy.kind === "combo") {
        return selectComboOption(el as HTMLInputElement, strValue)
          ? { ok: true }
          : (setInputValue(el, strValue) ? { ok: true } : { ok: false, reason: "set_failed" });
      }
      return setInputValue(el, strValue) ? { ok: true } : { ok: false, reason: "set_failed" };
    }
    return { ok: false, reason: "unsupported_element" };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

export function applySearchFilters(filters: AtiFilters): ApplyFiltersResult {
  const applied: string[] = [];
  const failed: Array<{ field: string; reason: string }> = [];
  const missing: string[] = [];
  for (const strat of FORM_FIELDS) {
    const v = filters[strat.field];
    if (v === undefined || v === null || v === "") { missing.push(strat.field); continue; }
    const r = applyOne(strat, v);
    if (r.ok) applied.push(strat.field);
    else failed.push({ field: strat.field, reason: r.reason ?? "unknown" });
  }
  return {
    success: applied.length > 0 && failed.length === 0,
    appliedFields: applied,
    failedFields: failed,
    missingFields: missing,
    diagnostics: collectFormDiagnostics(),
  };
}
