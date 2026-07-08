// Pure helpers для определения перехода состояния авторизации ATI.
// Используются background/content для решения: слать ли login_required/detected.
"use strict";

const KNOWN = new Set(["unknown", "authenticated", "login_required"]);

export function normalizeAuthState(value) {
  const v = String(value ?? "").toLowerCase();
  if (KNOWN.has(v)) return v;
  return "unknown";
}

/** Слать login_required, если предыдущее состояние было authenticated (или впервые определили login_required). */
export function shouldEmitLoginRequired(previous, current) {
  const p = normalizeAuthState(previous);
  const c = normalizeAuthState(current);
  if (c !== "login_required") return false;
  return p === "authenticated" || p === "unknown";
}

/** Слать login_detected только если явно был login_required, а затем authenticated. */
export function shouldEmitLoginDetected(previous, current) {
  const p = normalizeAuthState(previous);
  const c = normalizeAuthState(current);
  return p === "login_required" && c === "authenticated";
}
