// TypeScript declarations for background-controller.mjs.
export interface FullScanControllerSnapshot {
  taskId: string | null;
  state: string;
  filterFingerprint: string | null;
  pagesRead: number;
  lastPageFingerprint: string | null;
  nextExpectedPage: number;
  updatedAt: string;
  lastErrorCode: string | null;
  dispatcherId: string | null;
  sessionId: string | null;
}

export interface FullScanControllerApi {
  syncFilters(taskId: string, fingerprint: string, signal?: AbortSignal): Promise<{ ok?: boolean; reset?: boolean; error?: string }>;
  begin(taskId: string, signal?: AbortSignal): Promise<{ ok?: boolean; error?: string }>;
  submitPage(taskId: string, pageFingerprint: string, signal?: AbortSignal): Promise<{ ok?: boolean; reason?: string; pages_read?: number; error?: string }>;
  complete(taskId: string, status?: "done" | "failed", error?: string, signal?: AbortSignal): Promise<{ ok?: boolean; error?: string }>;
  getStatus(taskId: string, signal?: AbortSignal): Promise<{ found?: boolean; status?: string; pages_read?: number; filter_fingerprint?: string | null; error?: string | null }>;
}

export interface FullScanControllerStorage {
  read(): Promise<FullScanControllerSnapshot | null>;
  write(snap: FullScanControllerSnapshot | null): Promise<void>;
}

export interface FullScanControllerDeps {
  api: FullScanControllerApi;
  storage: FullScanControllerStorage;
  now?: () => string;
}

export interface FullScanControllerFsmState {
  state: string;
  taskId: string | null;
  filterFingerprint: string | null;
  pagesRead: number;
  lastError: string | null;
  lastReason: string | null;
}

export class FullScanBackgroundController {
  constructor(deps: FullScanControllerDeps);
  restore(): Promise<void>;
  startOrSyncFilters(
    taskId: string,
    fingerprint: string,
    identity?: { dispatcherId?: string | null; sessionId?: string | null },
  ): Promise<{ reset: boolean; state: string }>;
  submitPage(
    taskId: string,
    pageUrl: string,
    textHashes: readonly string[],
  ): Promise<{ ok: boolean; reason?: string; pagesRead?: number; completed: boolean }>;
  completeTask(taskId: string, status?: "done" | "failed", error?: string): Promise<void>;
  stop(reason?: string): Promise<void>;
  getState(): FullScanControllerFsmState;
  getSnapshot(): FullScanControllerSnapshot;
}

export function createChromeSnapshotStorage(key?: string): FullScanControllerStorage;
