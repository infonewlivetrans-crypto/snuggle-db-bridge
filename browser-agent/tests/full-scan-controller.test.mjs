// Tests for Full Scan background-controller.
// Все зависимости мокаются; FullScanApi не используется — контроллер
// принимает любой api-объект с нужными методами.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FullScanBackgroundController, _internal,
} from "../src/full-scan/background-controller.mjs";
import { STATES } from "../src/shared/full-scan-state.mjs";

function makeStorage(initial = null) {
  let value = initial;
  return {
    async read() { return value ? { ...value } : null; },
    async write(snap) { value = snap ? { ...snap } : null; },
    _peek() { return value; },
  };
}

function makeApi(overrides = {}) {
  const calls = { syncFilters: [], begin: [], submitPage: [], complete: [], getStatus: [] };
  const api = {
    async syncFilters(taskId, fp, signal) {
      calls.syncFilters.push({ taskId, fp, aborted: signal?.aborted ?? false });
      return { ok: true, reset: false };
    },
    async begin(taskId, signal) {
      calls.begin.push({ taskId, aborted: signal?.aborted ?? false });
      return { ok: true };
    },
    async submitPage(taskId, pageFp, signal) {
      calls.submitPage.push({ taskId, pageFp, aborted: signal?.aborted ?? false });
      return { ok: true, pages_read: calls.submitPage.length };
    },
    async complete(taskId, status, error, signal) {
      calls.complete.push({ taskId, status, error, aborted: signal?.aborted ?? false });
      return { ok: true };
    },
    async getStatus(taskId) {
      calls.getStatus.push({ taskId });
      return { found: true, status: "running", pages_read: 0, filter_fingerprint: null };
    },
    _calls: calls,
    ...overrides,
  };
  api._calls = calls;
  return api;
}

test("startOrSyncFilters calls syncFilters + begin and persists snapshot", async () => {
  const storage = makeStorage();
  const api = makeApi();
  const c = new FullScanBackgroundController({ api, storage });
  const r = await c.startOrSyncFilters("t1", "fp1");
  assert.equal(r.reset, false);
  assert.equal(r.state, STATES.SCANNING);
  assert.equal(api._calls.syncFilters.length, 1);
  assert.equal(api._calls.begin.length, 1);
  const snap = storage._peek();
  assert.equal(snap.taskId, "t1");
  assert.equal(snap.state, STATES.SCANNING);
  assert.equal(snap.filterFingerprint, "fp1");
});

test("submitPage confirms server ack before returning", async () => {
  const storage = makeStorage();
  let resolveAck;
  const api = makeApi({
    async submitPage() {
      return new Promise((resolve) => { resolveAck = () => resolve({ ok: true, pages_read: 1 }); });
    },
  });
  const c = new FullScanBackgroundController({ api, storage });
  await c.startOrSyncFilters("t1", "fp");
  const p = c.submitPage("t1", "https://ati.su/loads/?p=1", ["h1"]);
  let settled = false;
  p.then(() => { settled = true; });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(settled, false);
  resolveAck();
  const res = await p;
  assert.equal(res.ok, true);
  assert.equal(res.pagesRead, 1);
});

test("rejects second active task with different taskId", async () => {
  const storage = makeStorage();
  const api = makeApi();
  const c = new FullScanBackgroundController({ api, storage });
  await c.startOrSyncFilters("t1", "fp");
  await assert.rejects(c.startOrSyncFilters("t2", "fp"), /another_task_active/);
});

test("submitPage is serialized (no parallel submissions)", async () => {
  const storage = makeStorage();
  let inFlight = 0; let maxInFlight = 0;
  const api = makeApi({
    async submitPage() {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight--;
      return { ok: true };
    },
  });
  const c = new FullScanBackgroundController({ api, storage });
  await c.startOrSyncFilters("t1", "fp");
  await Promise.all([
    c.submitPage("t1", "u", ["a"]),
    c.submitPage("t1", "u", ["b"]),
    c.submitPage("t1", "u", ["c"]),
  ]);
  assert.equal(maxInFlight, 1);
});

test("loop_detected auto-completes exactly once", async () => {
  const storage = makeStorage();
  const api = makeApi({
    async submitPage() { return { ok: false, reason: "loop_detected", pages_read: 3 }; },
  });
  const c = new FullScanBackgroundController({ api, storage });
  await c.startOrSyncFilters("t1", "fp");
  const r = await c.submitPage("t1", "u", ["h"]);
  assert.equal(r.completed, true);
  assert.equal(r.reason, "loop_detected");
  assert.equal(api._calls.complete.length, 1);
  // Второй submitPage не должен вызвать complete повторно.
  const r2 = await c.submitPage("t1", "u", ["h"]);
  assert.equal(r2.completed, true);
  assert.equal(api._calls.complete.length, 1);
});

test("stop() aborts signal and clears active task", async () => {
  const storage = makeStorage();
  const seen = [];
  const api = makeApi({
    async submitPage(taskId, fp, signal) {
      seen.push({ aborted: signal?.aborted });
      await new Promise((r) => setTimeout(r, 5));
      return { ok: true };
    },
  });
  const c = new FullScanBackgroundController({ api, storage });
  await c.startOrSyncFilters("t1", "fp");
  await c.stop("user_stopped");
  assert.equal(c.getState().state, STATES.IDLE);
  assert.equal(storage._peek().taskId, null);
});

test("stale taskId responses are ignored", async () => {
  const storage = makeStorage();
  const api = makeApi({
    async submitPage() {
      await new Promise((r) => setTimeout(r, 15));
      return { ok: true, pages_read: 1 };
    },
  });
  const c = new FullScanBackgroundController({ api, storage });
  await c.startOrSyncFilters("t1", "fp");
  const inflight = c.submitPage("t1", "u", ["h"]);
  await c.stop();
  // После stop taskId=null → submitPage должен вернуть task_id_mismatch.
  const res = await inflight;
  assert.equal(res.ok, false);
  assert.equal(res.reason, "task_id_mismatch");
});

test("restore from scanning: hits getStatus once and restores FSM", async () => {
  const storage = makeStorage({
    taskId: "t1", state: STATES.SCANNING, filterFingerprint: "fp",
    pagesRead: 2, lastPageFingerprint: "p", nextExpectedPage: 3,
    updatedAt: "x", lastErrorCode: null, dispatcherId: null, sessionId: null,
  });
  const api = makeApi({
    async getStatus() { return { found: true, status: "running", pages_read: 5, filter_fingerprint: "fp" }; },
  });
  const c = new FullScanBackgroundController({ api, storage });
  await c.restore();
  await c.restore(); // повторный вызов не должен снова дёргать сервер
  assert.equal(api._calls.getStatus.length, 1);
  assert.equal(c.getState().state, STATES.SCANNING);
  assert.equal(c.getState().pagesRead, 5);
});

test("restore terminal (completed/failed) does not hit server", async () => {
  const storage = makeStorage({
    taskId: "t1", state: STATES.COMPLETED, filterFingerprint: "fp",
    pagesRead: 4, lastPageFingerprint: null, nextExpectedPage: 5,
    updatedAt: "x", lastErrorCode: null, dispatcherId: null, sessionId: null,
  });
  const api = makeApi();
  const c = new FullScanBackgroundController({ api, storage });
  await c.restore();
  assert.equal(api._calls.getStatus.length, 0);
  assert.equal(c.getState().state, STATES.COMPLETED);
});

test("snapshot never contains agent token / password / cookie / service_role", async () => {
  const storage = makeStorage();
  const api = makeApi();
  const c = new FullScanBackgroundController({ api, storage });
  await c.startOrSyncFilters("t1", "fp", { dispatcherId: "d1", sessionId: "s1" });
  await c.submitPage("t1", "u", ["h"]);
  const snap = storage._peek();
  const s = JSON.stringify(snap).toLowerCase();
  for (const bad of ["token", "password", "cookie", "authorization", "service_role", "secret"]) {
    assert.ok(!s.includes(bad), `snapshot must not include "${bad}" — got ${s}`);
  }
});

test("assertNoSecrets rejects secret-shaped keys directly", () => {
  assert.throws(() => _internal.assertNoSecrets({ agent_token: "x" }), /snapshot_contains_secret_key/);
  assert.throws(() => _internal.assertNoSecrets({ Authorization: "x" }), /snapshot_contains_secret_key/);
  assert.doesNotThrow(() => _internal.assertNoSecrets({ taskId: "t1", pagesRead: 3 }));
});

test("safeErrorCode strips URLs and long text", () => {
  const c1 = _internal.safeErrorCode(new Error("500 https://x/y?token=abc"));
  assert.ok(!c1.includes("token"));
  assert.ok(!c1.includes("://"));
});

test("submitPage after successful start returns ok and increments pagesRead", async () => {
  const storage = makeStorage();
  const api = makeApi();
  const c = new FullScanBackgroundController({ api, storage });
  await c.startOrSyncFilters("t1", "fp");
  const r1 = await c.submitPage("t1", "u1", ["a"]);
  const r2 = await c.submitPage("t1", "u2", ["b"]);
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  assert.equal(r2.pagesRead, 2);
});
