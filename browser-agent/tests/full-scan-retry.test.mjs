import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isRetryableStatus, retryWithBackoff, computePageFingerprint,
} from "../src/shared/full-scan-retry.mjs";

test("isRetryableStatus classifies correctly", () => {
  assert.equal(isRetryableStatus(0), true);
  assert.equal(isRetryableStatus(408), true);
  assert.equal(isRetryableStatus(429), true);
  assert.equal(isRetryableStatus(500), true);
  assert.equal(isRetryableStatus(503), true);
  assert.equal(isRetryableStatus(200), false);
  assert.equal(isRetryableStatus(400), false);
  assert.equal(isRetryableStatus(401), false);
  assert.equal(isRetryableStatus(404), false);
});

test("retryWithBackoff returns body on 2xx first try", async () => {
  let calls = 0;
  const out = await retryWithBackoff(async () => {
    calls += 1;
    return { status: 200, body: { ok: true } };
  }, { sleep: async () => {} });
  assert.equal(calls, 1);
  assert.deepEqual(out, { ok: true });
});

test("retryWithBackoff retries on 500 up to maxAttempts", async () => {
  let calls = 0;
  const sleeps = [];
  await assert.rejects(
    retryWithBackoff(async () => {
      calls += 1;
      return { status: 500, body: {} };
    }, { maxAttempts: 3, baseMs: 10, sleep: async (ms) => { sleeps.push(ms); } }),
    /http_500/,
  );
  assert.equal(calls, 3);
  assert.equal(sleeps.length, 2); // sleep между попытками
  assert.ok(sleeps[1] >= sleeps[0]); // экспоненциально
});

test("retryWithBackoff does NOT retry on 4xx", async () => {
  let calls = 0;
  await assert.rejects(
    retryWithBackoff(async () => {
      calls += 1;
      return { status: 400, body: {} };
    }, { maxAttempts: 5, sleep: async () => {} }),
    /http_400/,
  );
  assert.equal(calls, 1);
});

test("retryWithBackoff succeeds after transient 503", async () => {
  let calls = 0;
  const out = await retryWithBackoff(async () => {
    calls += 1;
    if (calls < 3) return { status: 503, body: {} };
    return { status: 200, body: { ok: true } };
  }, { maxAttempts: 5, sleep: async () => {} });
  assert.equal(calls, 3);
  assert.deepEqual(out, { ok: true });
});

test("retryWithBackoff aborts immediately when signal aborted", async () => {
  const ctrl = new AbortController();
  ctrl.abort();
  await assert.rejects(
    retryWithBackoff(async () => ({ status: 200, body: {} }), { signal: ctrl.signal, sleep: async () => {} }),
    /aborted/,
  );
});

test("computePageFingerprint is stable regardless of load order", () => {
  const a = computePageFingerprint("https://ati.su/loads?page=1", ["h1", "h2", "h3"]);
  const b = computePageFingerprint("https://ati.su/loads?page=1", ["h3", "h1", "h2"]);
  assert.equal(a, b);
});

test("computePageFingerprint changes with URL or loads", () => {
  const a = computePageFingerprint("https://ati.su/loads?page=1", ["h1"]);
  const b = computePageFingerprint("https://ati.su/loads?page=2", ["h1"]);
  const c = computePageFingerprint("https://ati.su/loads?page=1", ["h2"]);
  assert.notEqual(a, b);
  assert.notEqual(a, c);
});

test("computePageFingerprint ignores empty/nullish hashes", () => {
  const a = computePageFingerprint("u", ["h1", "h2"]);
  const b = computePageFingerprint("u", ["", "h1", "h2", ""]);
  assert.equal(a, b);
});
