import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeRefreshIntervalSeconds, shouldRunScheduledRefresh,
  shouldStopScheduler, shouldRunMissingLogic, getNextRefreshAt,
} from "../src/shared/scheduler-state.mjs";

test("interval 20s normalized to 60", () => {
  assert.equal(normalizeRefreshIntervalSeconds(20), 60);
});
test("interval 60s stays 60", () => {
  assert.equal(normalizeRefreshIntervalSeconds(60), 60);
});
test("interval 9999 capped to 3600", () => {
  assert.equal(normalizeRefreshIntervalSeconds(9999), 3600);
});

test("paused: no run, must stop", () => {
  assert.equal(shouldRunScheduledRefresh({ taskStatus: "paused", autoRefreshEnabled: true }), false);
  assert.equal(shouldStopScheduler("paused"), true);
});
test("stopped: must stop", () => {
  assert.equal(shouldStopScheduler("stopped"), true);
});
test("confirmed/deal_created stops scheduler", () => {
  assert.equal(shouldStopScheduler("confirmed"), true);
  assert.equal(shouldStopScheduler("deal_created"), true);
});
test("searching + enabled → runs", () => {
  assert.equal(shouldRunScheduledRefresh({ taskStatus: "searching", autoRefreshEnabled: true }), true);
});

test("missing logic: forbidden while login_required", () => {
  assert.equal(shouldRunMissingLogic({ taskStatus: "waiting_user_login", readSuccess: true, authenticated: false }), false);
});
test("missing logic: forbidden if extraction_failed", () => {
  assert.equal(shouldRunMissingLogic({ taskStatus: "extraction_failed", readSuccess: true, authenticated: true }), false);
});
test("missing logic: allowed after successful authenticated read", () => {
  assert.equal(shouldRunMissingLogic({ taskStatus: "searching", readSuccess: true, authenticated: true }), true);
});
test("missing logic: no if read failed", () => {
  assert.equal(shouldRunMissingLogic({ taskStatus: "searching", readSuccess: false, authenticated: true }), false);
});

test("getNextRefreshAt returns ISO now+interval", () => {
  const now = 1_700_000_000_000;
  const iso = getNextRefreshAt(now, 60);
  assert.equal(iso, new Date(now + 60_000).toISOString());
});
