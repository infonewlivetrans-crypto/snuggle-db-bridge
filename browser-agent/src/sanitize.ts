// Безопасная санитизация диагностики Browser Agent.
// Удаляет любые чувствительные поля перед выдачей наружу (popup, копирование в буфер,
// health-ответ). Тесты в tests/sanitize.test.mjs.

const SENSITIVE_KEYS = new Set<string>([
  "agent_token", "token", "token_hash", "agent_token_hash", "pairing_code",
  "cookie", "cookies", "authorization", "auth_token", "bearer",
  "password", "pass", "pwd", "secret",
  "login", "username", "email", "phone", "tel",
  "localstorage", "session_cookie", "session_id_ati",
  "raw_html", "outer_html", "full_html",
  "contacts", "contact_list", "contact",
]);

const SENSITIVE_KEY_PATTERNS: RegExp[] = [
  /token/i, /secret/i, /password/i, /cookie/i, /auth/i,
  /bearer/i, /pairing/i, /credential/i,
];

/** Обрезать query из URL — там могут быть session и токены. */
export function sanitizeUrl(u: unknown): string {
  if (typeof u !== "string") return "";
  try {
    const url = new URL(u);
    return `${url.origin}${url.pathname}`;
  } catch { return ""; }
}

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  if (SENSITIVE_KEYS.has(k)) return true;
  return SENSITIVE_KEY_PATTERNS.some((r) => r.test(k));
}

/** Рекурсивно удаляет чувствительные поля и обрезает URL. */
export function sanitizeAgentDiagnostics<T>(input: T): T {
  return _walk(input, 0) as T;
}

function _walk(v: unknown, depth: number): unknown {
  if (depth > 8) return "[depth_limit]";
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map((x) => _walk(x, depth + 1));
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (isSensitiveKey(k)) { out[k] = "[redacted]"; continue; }
      if (/url$/i.test(k) && typeof val === "string") { out[k] = sanitizeUrl(val); continue; }
      out[k] = _walk(val, depth + 1);
    }
    return out;
  }
  if (typeof v === "string") {
    // Обрежем очень длинные строки (например, случайный raw HTML).
    return v.length > 2000 ? v.slice(0, 2000) + "…[truncated]" : v;
  }
  return v;
}
