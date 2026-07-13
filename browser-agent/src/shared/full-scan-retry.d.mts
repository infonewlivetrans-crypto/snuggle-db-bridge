export function isRetryableStatus(status: number): boolean;
export function retryWithBackoff<T>(
  attemptFn: (attempt: number) => Promise<{ status: number; body: T } | T>,
  opts?: {
    maxAttempts?: number;
    baseMs?: number;
    maxMs?: number;
    sleep?: (ms: number) => Promise<void>;
    signal?: AbortSignal;
  },
): Promise<T>;
export function computePageFingerprint(pageUrl: string, loadHashes: readonly string[]): string;
