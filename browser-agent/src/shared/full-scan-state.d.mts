export type FullScanStateName =
  | "idle" | "syncing_filters" | "scanning" | "paused"
  | "login_required" | "completing" | "completed" | "failed";

export interface FullScanState {
  state: FullScanStateName;
  taskId: string | null;
  filterFingerprint: string | null;
  pagesRead: number;
  lastError: string | null;
  lastReason: string | null;
}

export const STATES: Record<string, FullScanStateName>;
export const EVENTS: Record<string, string>;

export function initialState(): FullScanState;
export function fromServerStatus(serverStatus: unknown, taskId: string): FullScanState;
export function transition(
  state: FullScanState,
  event: { type: string },
  payload?: Record<string, unknown>,
): FullScanState;
export function computeBackoffMs(
  attempt: number,
  opts?: { baseMs?: number; maxMs?: number },
): number;
export function isTerminal(state: FullScanState): boolean;
