export function normalizeRefreshIntervalSeconds(v: unknown): number;
export function shouldStopScheduler(taskStatus: unknown): boolean;
export function shouldRunScheduledRefresh(input: { taskStatus: unknown; autoRefreshEnabled: unknown }): boolean;
export function shouldRunMissingLogic(input: { taskStatus: unknown; readSuccess: unknown; authenticated: unknown }): boolean;
export function getNextRefreshAt(nowMs: number, intervalSeconds: number): string | null;
