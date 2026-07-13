// Pure retry-loop и page-fingerprint для Full Scan API.
// Держим в .mjs, чтобы можно было тестировать через node --test без сборки TS.

import { computeBackoffMs } from "./full-scan-state.mjs";

/**
 * Классификатор HTTP-статусов: ретраить или нет.
 * Сеть (status=0), 408, 429, 5xx → да; 4xx (кроме 408/429) → нет.
 */
export function isRetryableStatus(status) {
  const s = Number(status);
  if (s === 0 || s === 408 || s === 429) return true;
  return s >= 500 && s < 600;
}

/**
 * Универсальный ретрай с экспоненциальным backoff.
 * @param {() => Promise<{status:number, body:any}>} attemptFn
 * @param {object} opts { maxAttempts, baseMs, maxMs, sleep, signal }
 */
export async function retryWithBackoff(attemptFn, opts = {}) {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const baseMs = opts.baseMs ?? 500;
  const maxMs = opts.maxMs ?? 8000;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const signal = opts.signal;
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) throw new Error("aborted");
    let nonRetryable = false;
    try {
      const res = await attemptFn(attempt);
      if (res && typeof res === "object" && "status" in res) {
        if (res.status >= 200 && res.status < 300) return res.body;
        lastErr = new Error(`http_${res.status}`);
        if (!isRetryableStatus(res.status)) nonRetryable = true;
      } else {
        return res;
      }
    } catch (e) {
      if (e && e.message === "aborted") throw e;
      lastErr = e;
    }
    if (nonRetryable) break;
    if (attempt < maxAttempts) {
      await sleep(computeBackoffMs(attempt, { baseMs, maxMs }));
    }
  }
  throw lastErr ?? new Error("request_failed");
}

/**
 * Стабильный fingerprint страницы = URL + отсортированные хеши грузов.
 * DJB2, чтобы не тянуть crypto в браузерный runtime.
 */
export function computePageFingerprint(pageUrl, loadHashes) {
  const hashes = Array.from(loadHashes || [])
    .filter((h) => typeof h === "string" && h.length > 0)
    .sort();
  const s = `${pageUrl}|${hashes.join(",")}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16);
}
