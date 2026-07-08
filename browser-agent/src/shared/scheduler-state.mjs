// Pure state machine для search scheduler.
// Никаких chrome.alarms/storage. Только чистые функции для тестов.
"use strict";

const STOP_STATUSES = new Set([
  "paused", "stopped", "failed", "confirmed", "deal_created", "suitable_found",
]);

const NO_MISSING_STATUSES = new Set([
  "waiting_user_login", "extraction_failed", "opening_ati",
  "applying_filters", "starting_search",
]);

export function normalizeRefreshIntervalSeconds(v) {
  const n = Number(v ?? 60);
  if (!Number.isFinite(n) || n < 60) return 60;
  if (n > 3600) return 3600;
  return Math.floor(n);
}

export function shouldStopScheduler(taskStatus) {
  if (!taskStatus) return true;
  return STOP_STATUSES.has(String(taskStatus));
}

export function shouldRunScheduledRefresh({ taskStatus, autoRefreshEnabled }) {
  if (!autoRefreshEnabled) return false;
  return !shouldStopScheduler(taskStatus);
}

export function shouldRunMissingLogic({ taskStatus, readSuccess, authenticated }) {
  if (!readSuccess) return false;
  if (!authenticated) return false;
  if (!taskStatus) return true;
  return !NO_MISSING_STATUSES.has(String(taskStatus));
}

export function getNextRefreshAt(nowMs, intervalSeconds) {
  const now = Number(nowMs);
  if (!Number.isFinite(now)) return null;
  const interval = normalizeRefreshIntervalSeconds(intervalSeconds);
  return new Date(now + interval * 1000).toISOString();
}
