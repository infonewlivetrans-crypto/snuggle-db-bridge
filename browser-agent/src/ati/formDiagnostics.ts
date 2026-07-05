// Диагностика формы ATI. Возвращает обезличенные сведения.
// Никогда не включает agent token, pairing-код, cookies, персональные данные.
import { ATI_SELECTOR_CONFIG_VERSION } from "./atiSelectors";
import { FORM_FIELDS, findFieldElement } from "./formSelectors";

export interface FormDiagnostics {
  pageUrl: string;
  selectorConfigVersion: string;
  hasForm: boolean;
  detectedFormCount: number;
  detectedInputs: string[];
  fieldsFound: string[];
  fieldsMissing: string[];
  loadRowCandidates: number;
  strategyUsed?: string;
  errors: string[];
}

function sanitizeUrl(u: string): string {
  try {
    const url = new URL(u);
    // отбрасываем query — там могут быть чувствительные параметры сессии.
    return `${url.origin}${url.pathname}`;
  } catch { return ""; }
}

export function collectFormDiagnostics(): FormDiagnostics {
  const errors: string[] = [];
  const forms = document.querySelectorAll("form");
  const found: string[] = [];
  const missing: string[] = [];
  for (const f of FORM_FIELDS) {
    try {
      const el = findFieldElement(f);
      if (el) found.push(f.field);
      else missing.push(f.field);
    } catch (e) { errors.push(`${f.field}: ${(e as Error).message}`); }
  }
  const inputs = Array.from(document.querySelectorAll("input,select,textarea"))
    .slice(0, 50)
    .map((el) => {
      const name = (el as HTMLInputElement).name || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "";
      return `${el.tagName.toLowerCase()}[${name.slice(0, 40)}]`;
    });
  return {
    pageUrl: sanitizeUrl(window.location.href),
    selectorConfigVersion: ATI_SELECTOR_CONFIG_VERSION,
    hasForm: forms.length > 0,
    detectedFormCount: forms.length,
    detectedInputs: inputs,
    fieldsFound: found,
    fieldsMissing: missing,
    loadRowCandidates: document.querySelectorAll('[data-testid*="loads"], [class*="loads-list"], [class*="load-card"]').length,
    errors,
  };
}
