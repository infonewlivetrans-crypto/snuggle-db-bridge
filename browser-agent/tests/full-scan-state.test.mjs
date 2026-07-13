import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STATES, EVENTS, initialState, transition, fromServerStatus,
  computeBackoffMs, isTerminal,
} from "../src/shared/full-scan-state.mjs";

test("initial state is idle", () => {
  const s = initialState();
  assert.equal(s.state, STATES.IDLE);
  assert.equal(s.taskId, null);
  assert.equal(s.pagesRead, 0);
});

test("START moves to syncing_filters and records taskId+fingerprint", () => {
  const s = transition(initialState(), { type: EVENTS.START }, { taskId: "t1", fingerprint: "fp1" });
  assert.equal(s.state, STATES.SYNCING_FILTERS);
  assert.equal(s.taskId, "t1");
  assert.equal(s.filterFingerprint, "fp1");
});

test("START without taskId is ignored", () => {
  const s = transition(initialState(), { type: EVENTS.START }, {});
  assert.equal(s.state, STATES.IDLE);
  assert.equal(s.lastReason, "missing_task_id");
});

test("START while another task is active is refused (single-task invariant)", () => {
  let s = transition(initialState(), { type: EVENTS.START }, { taskId: "t1", fingerprint: "a" });
  s = transition(s, { type: EVENTS.SYNC_OK }, { taskId: "t1", reset: false });
  const s2 = transition(s, { type: EVENTS.START }, { taskId: "t2", fingerprint: "b" });
  assert.equal(s2.state, STATES.SCANNING);
  assert.equal(s2.lastReason, "another_task_active");
});

test("SYNC_OK with reset zeroes pagesRead", () => {
  let s = transition(initialState(), { type: EVENTS.START }, { taskId: "t1", fingerprint: "a" });
  s = { ...s, pagesRead: 5 };
  s = transition(s, { type: EVENTS.SYNC_OK }, { taskId: "t1", reset: true });
  assert.equal(s.state, STATES.SCANNING);
  assert.equal(s.pagesRead, 0);
});

test("PAGE_OK increments pagesRead", () => {
  let s = transition(initialState(), { type: EVENTS.START }, { taskId: "t1" });
  s = transition(s, { type: EVENTS.SYNC_OK }, { taskId: "t1" });
  s = transition(s, { type: EVENTS.PAGE_OK }, { taskId: "t1", pagesRead: 1 });
  s = transition(s, { type: EVENTS.PAGE_OK }, { taskId: "t1", pagesRead: 2 });
  assert.equal(s.pagesRead, 2);
});

test("PAGE_LOOP → completing then COMPLETE_OK → completed", () => {
  let s = transition(initialState(), { type: EVENTS.START }, { taskId: "t1" });
  s = transition(s, { type: EVENTS.SYNC_OK }, { taskId: "t1" });
  s = transition(s, { type: EVENTS.PAGE_LOOP }, { taskId: "t1" });
  assert.equal(s.state, STATES.COMPLETING);
  assert.equal(s.lastReason, "loop_detected");
  s = transition(s, { type: EVENTS.COMPLETE_OK }, { taskId: "t1" });
  assert.equal(s.state, STATES.COMPLETED);
});

test("PAGE_FAIL retryable stays in scanning", () => {
  let s = transition(initialState(), { type: EVENTS.START }, { taskId: "t1" });
  s = transition(s, { type: EVENTS.SYNC_OK }, { taskId: "t1" });
  s = transition(s, { type: EVENTS.PAGE_FAIL }, { taskId: "t1", retryable: true, error: "net" });
  assert.equal(s.state, STATES.SCANNING);
  assert.equal(s.lastError, "net");
});

test("PAUSE/RESUME cycle", () => {
  let s = transition(initialState(), { type: EVENTS.START }, { taskId: "t1" });
  s = transition(s, { type: EVENTS.SYNC_OK }, { taskId: "t1" });
  s = transition(s, { type: EVENTS.PAUSE }, { taskId: "t1" });
  assert.equal(s.state, STATES.PAUSED);
  s = transition(s, { type: EVENTS.RESUME }, { taskId: "t1" });
  assert.equal(s.state, STATES.SCANNING);
});

test("LOGIN_REQUIRED then LOGIN_RESUMED returns to scanning", () => {
  let s = transition(initialState(), { type: EVENTS.START }, { taskId: "t1" });
  s = transition(s, { type: EVENTS.SYNC_OK }, { taskId: "t1" });
  s = transition(s, { type: EVENTS.LOGIN_REQUIRED }, { taskId: "t1" });
  assert.equal(s.state, STATES.LOGIN_REQUIRED);
  s = transition(s, { type: EVENTS.LOGIN_RESUMED }, { taskId: "t1" });
  assert.equal(s.state, STATES.SCANNING);
});

test("events for foreign taskId are ignored", () => {
  let s = transition(initialState(), { type: EVENTS.START }, { taskId: "t1" });
  s = transition(s, { type: EVENTS.SYNC_OK }, { taskId: "t1" });
  const s2 = transition(s, { type: EVENTS.PAGE_OK }, { taskId: "t2" });
  assert.equal(s2.state, STATES.SCANNING);
  assert.equal(s2.lastReason, "task_id_mismatch");
});

test("ABORT resets to idle from any state", () => {
  let s = transition(initialState(), { type: EVENTS.START }, { taskId: "t1" });
  s = transition(s, { type: EVENTS.ABORT }, {});
  assert.deepEqual(s, initialState());
});

test("fromServerStatus maps running → scanning and preserves fingerprint", () => {
  const s = fromServerStatus(
    { status: "running", pages_read: 3, filter_fingerprint: "fp" },
    "t1",
  );
  assert.equal(s.state, STATES.SCANNING);
  assert.equal(s.pagesRead, 3);
  assert.equal(s.filterFingerprint, "fp");
  assert.equal(s.taskId, "t1");
});

test("fromServerStatus done → completed, failed → failed", () => {
  assert.equal(fromServerStatus({ status: "done" }, "t").state, STATES.COMPLETED);
  assert.equal(fromServerStatus({ status: "failed", error: "x" }, "t").state, STATES.FAILED);
});

test("computeBackoffMs grows exponentially and clamps", () => {
  assert.equal(computeBackoffMs(0), 0);
  assert.equal(computeBackoffMs(1, { baseMs: 100, maxMs: 10000 }), 100);
  assert.equal(computeBackoffMs(2, { baseMs: 100, maxMs: 10000 }), 200);
  assert.equal(computeBackoffMs(4, { baseMs: 100, maxMs: 10000 }), 800);
  assert.equal(computeBackoffMs(20, { baseMs: 100, maxMs: 5000 }), 5000);
});

test("isTerminal is true for idle/completed/failed", () => {
  assert.equal(isTerminal(initialState()), true);
  assert.equal(isTerminal({ ...initialState(), state: STATES.COMPLETED }), true);
  assert.equal(isTerminal({ ...initialState(), state: STATES.FAILED }), true);
  assert.equal(isTerminal({ ...initialState(), state: STATES.SCANNING }), false);
});
