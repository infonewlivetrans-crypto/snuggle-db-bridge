// Типизированный клиент Full Scan для Browser Agent.
// HTTP-контракт /api/public/agent/ai-dispatcher/full-scan/*.
// Логика состояний — shared/full-scan-state.mjs; ретрай — shared/full-scan-retry.mjs.

import { retryWithBackoff, computePageFingerprint as pfp } from "../shared/full-scan-retry.mjs";

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

export class FullScanApi {
  private readonly fetchImpl: ApiFetch;
  private readonly sleep?: ApiSleep;
  private readonly maxAttempts: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;

  constructor(opts: FullScanApiOptions) {
    this.fetchImpl = opts.fetchImpl;
    this.sleep = opts.sleep;
    this.maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
    this.baseBackoffMs = opts.baseBackoffMs ?? 500;
    this.maxBackoffMs = opts.maxBackoffMs ?? 8000;
  }

  private request<T>(
    method: "GET" | "POST",
    path: string,
    body: unknown | null,
    signal?: AbortSignal,
  ): Promise<T> {
    return retryWithBackoff<T>(async () => {
      const init: RequestInit = { method, signal };
      if (body !== null) {
        init.body = JSON.stringify(body);
        init.headers = { "content-type": "application/json" };
      }
      const res = await this.fetchImpl(path, init);
      let parsed: T;
      try { parsed = (await res.json()) as T; } catch { parsed = {} as T; }
      return { status: res.status, body: parsed };
    }, {
      maxAttempts: this.maxAttempts,
      baseMs: this.baseBackoffMs,
      maxMs: this.maxBackoffMs,
      sleep: this.sleep,
      signal,
    });
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

export const computePageFingerprint = pfp;
