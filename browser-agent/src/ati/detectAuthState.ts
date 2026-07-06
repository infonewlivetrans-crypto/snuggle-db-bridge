// Определение состояния авторизации на ati.su без чтения cookies/password/localStorage.
// Использует только видимые DOM-признаки: несколько независимых сигналов, чтобы избежать
// ложных срабатываний на одном случайном CSS-классе.
//
// ⚠ Селекторы ATI меняются — реальные signatures проверяем вручную (см. MANUAL_TEST_CHECKLIST).

export type AtiAuthState = "authenticated" | "login_required" | "unknown";

export interface AtiAuthDetection {
  status: AtiAuthState;
  strategy?: string;
  confidence?: number; // 0..1
}

// Признаки залогиненного кабинета.
const AUTH_SIGNALS: readonly string[] = [
  "[data-qa='user-menu']",
  "[data-testid='user-menu']",
  ".user-menu",
  "a[href*='/logout']",
  "a[href*='/profile']",
];

// Признаки необходимости логина.
const LOGIN_SIGNALS: readonly string[] = [
  "form[action*='login']",
  "input[name='password']",
  "[data-qa='login-form']",
  "a[href*='/login']",
];

const LOGIN_PATH_PATTERN = /\/(login|auth|signin|passport)/i;

function documentSafe(): Document | null {
  try { return typeof document !== "undefined" ? document : null; } catch { return null; }
}

function countMatches(doc: Document, selectors: readonly string[]): number {
  let n = 0;
  for (const sel of selectors) {
    try { if (doc.querySelector(sel)) n++; } catch { /* ignore */ }
  }
  return n;
}

export function detectAtiAuthState(doc?: Document | null): AtiAuthDetection {
  const d = doc ?? documentSafe();
  if (!d) return { status: "unknown", strategy: "no_document", confidence: 0 };

  const url = (d.location?.pathname ?? "") + (d.location?.search ?? "");
  const isLoginPath = LOGIN_PATH_PATTERN.test(url);
  const authHits = countMatches(d, AUTH_SIGNALS);
  const loginHits = countMatches(d, LOGIN_SIGNALS);

  if (isLoginPath && authHits === 0 && loginHits > 0) {
    return { status: "login_required", strategy: "login_path+form", confidence: 0.95 };
  }
  if (authHits >= 2) {
    return { status: "authenticated", strategy: "multi_auth_signals", confidence: 0.85 };
  }
  if (authHits >= 1 && loginHits === 0) {
    return { status: "authenticated", strategy: "auth_signal", confidence: 0.6 };
  }
  if (loginHits >= 2 && authHits === 0) {
    return { status: "login_required", strategy: "multi_login_signals", confidence: 0.8 };
  }
  if (loginHits >= 1 && authHits === 0 && isLoginPath) {
    return { status: "login_required", strategy: "single_login_signal", confidence: 0.55 };
  }
  return { status: "unknown", strategy: "insufficient_signals", confidence: 0.2 };
}
