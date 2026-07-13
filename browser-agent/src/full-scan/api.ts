// Типизированный клиент Full Scan для Browser Agent.
// Отвечает ТОЛЬКО за HTTP-контракт с /api/public/agent/ai-dispatcher/full-scan/*.
// Логика состояний — в shared/full-scan-state.mjs.
//
// Дизайн:
// - fetch и sleep инжектируются (для юнит-тестов);
// - retry с экспоненциальным backoff только на сетевых ошибках и 5xx;
// - 4xx — терминальная ошибка (не ретраим);
// - каждый запрос принимает AbortSignal — можно отменить при переключении задания.

import { computeBackoffMs } from "../shared/full-scan-state.mjs";

export type FullScanServerStatus = "pending" | "reset" | "running" | "done" | "failed";

export interface FullScanStatus {
  found: boolean;
  status?: FullScanServerStatus;
  pages_read?: number;
  filter_fingerprint?: string | null;
  last_seen_page_fingerprint?: string | null;
  pagination_max_pages?: number;
  started_at?: string | null;
  completed_at?: string | null;
  error?: string | null;
}

export interface SyncFiltersResult { ok: boolean; reset?: boolean; previous?: string | null; error?: string; }
export interface BeginResult { ok: boolean; status?: string; error?: string; }
export interface PageResult { ok: boolean; reason?: string; pages_read?: number; error?: string; }
export interface CompleteResult { ok: boolean; error?: string; }

export type ApiFetch = (path: string, init: RequestInit) => Promise<Response>;
export type ApiSleep = (ms: number) => Promise<void>;

export interface FullScanApiOptions {
  fetchImpl: ApiFetch;
  sleep?: ApiSleep;
  maxAttempts?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}

const defaultSleep: ApiSleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isRetryableStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || (status >= 500 && status < 600);
}

export class FullScanApi {
  private readonly fetchImpl: ApiFetch;
  private readonly sleep: ApiSleep;
  private readonly maxAttempts: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;

  constructor(opts: FullScanApiOptions) {
    this.fetchImpl = opts.fetchImpl;
    this.sleep = opts.sleep ?? defaultSleep;
    this.maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
    this.baseBackoffMs = opts.baseBackoffMs ?? 500;
    this.maxBackoffMs = opts.maxBackoffMs ?? 8000;
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body: unknown | null,
    signal?: AbortSignal,
  ): Promise<T> {
    let attempt = 0;
    let lastErr: Error | null = null;
    while (attempt < this.maxAttempts) {
      attempt += 1;
      if (signal?.aborted) throw new Error("aborted");
      try {
        const init: RequestInit = { method, signal };
        if (body !== null) {
          init.body = JSON.stringify(body);
          init.headers = { "content-type": "application/json" };
        }
        const res = await this.fetchImpl(path, init);
        if (res.ok) return (await res.json()) as T;
        // 4xx — не ретраим.
        if (!isRetryableStatus(res.status)) {
          const text = await res.text().catch(() => "");
          throw new Error(`http_${res.status}:${text}`);
        }
        lastErr = new Error(`http_${res.status}`);
      } catch (e) {
        if ((e as Error).message === "aborted") throw e;
        lastErr = e as Error;
      }
      if (attempt < this.maxAttempts) {
        const wait = computeBackoffMs(attempt, { baseMs: this.baseBackoffMs, maxMs: this.maxBackoffMs });
        await this.sleep(wait);
      }
    }
    throw lastErr ?? new Error("request_failed");
  }

  syncFilters(taskId: string, fingerprint: string, signal?: AbortSignal): Promise<SyncFiltersResult> {
    return this.request<SyncFiltersResult>(
      "POST",
      `/api/public/agent/ai-dispatcher/full-scan/sync-filters/${encodeURIComponent(taskId)}`,
      { filter_fingerprint: fingerprint },
      signal,
    );
  }

  begin(taskId: string, signal?: AbortSignal): Promise<BeginResult> {
    return this.request<BeginResult>(
      "POST",
      `/api/public/agent/ai-dispatcher/full-scan/begin/${encodeURIComponent(taskId)}`,
      {},
      signal,
    );
  }

  submitPage(taskId: string, pageFingerprint: string, signal?: AbortSignal): Promise<PageResult> {
    return this.request<PageResult>(
      "POST",
      `/api/public/agent/ai-dispatcher/full-scan/page/${encodeURIComponent(taskId)}`,
      { page_fingerprint: pageFingerprint },
      signal,
    );
  }

  complete(
    taskId: string,
    status: "done" | "failed" = "done",
    error?: string,
    signal?: AbortSignal,
  ): Promise<CompleteResult> {
    return this.request<CompleteResult>(
      "POST",
      `/api/public/agent/ai-dispatcher/full-scan/complete/${encodeURIComponent(taskId)}`,
      { status, error: error ?? null },
      signal,
    );
  }

  getStatus(taskId: string, signal?: AbortSignal): Promise<FullScanStatus> {
    return this.request<FullScanStatus>(
      "GET",
      `/api/public/agent/ai-dispatcher/full-scan/status/${encodeURIComponent(taskId)}`,
      null,
      signal,
    );
  }
}

/**
 * Вычислить стабильный fingerprint страницы: URL + отсортированные хеши грузов.
 * Изолировано, чтобы можно было тестировать и переиспользовать.
 */
export function computePageFingerprint(pageUrl: string, loadHashes: readonly string[]): string {
  const hashes = [...loadHashes].filter((h) => h && h.length > 0).sort();
  const s = `${pageUrl}|${hashes.join(",")}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16);
}
