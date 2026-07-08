// Pure правила для managed tabs. Никаких chrome.* API.
"use strict";

const ATI_HOST_RE = /(^|\.)ati\.su$/i;

export function isManagedAtiTab(record) {
  if (!record || typeof record !== "object") return false;
  const url = String(record.url ?? "");
  try {
    const u = new URL(url);
    return ATI_HOST_RE.test(u.hostname);
  } catch {
    return false;
  }
}

export function canCloseManagedTab(record, taskId) {
  if (!record || typeof record !== "object") return false;
  if (record.createdByAgent !== true) return false;
  if (!taskId) return false;
  return String(record.searchTaskId ?? "") === String(taskId);
}

export function canRestoreManagedTab(record) {
  if (!record || typeof record !== "object") return false;
  if (record.createdByAgent !== true) return false;
  const tabId = Number(record.tabId ?? NaN);
  return Number.isFinite(tabId) && tabId > 0;
}
