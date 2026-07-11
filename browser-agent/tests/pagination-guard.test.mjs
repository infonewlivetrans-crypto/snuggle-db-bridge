import { test } from "node:test";
import assert from "node:assert/strict";
import { createPaginationGuard } from "../src/shared/pagination-guard.mjs";
import { computeFilterFingerprint } from "../src/shared/filter-fingerprint.mjs";

test("records unique pages", () => {
  const g = createPaginationGuard();
  assert.deepEqual(g.recordPage("a"), { ok: true, pagesRead: 1 });
  assert.deepEqual(g.recordPage("b"), { ok: true, pagesRead: 2 });
});
test("detects loop on repeat fingerprint", () => {
  const g = createPaginationGuard();
  g.recordPage("a");
  const r = g.recordPage("a");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "pagination_loop_detected");
});
test("stops on max pages", () => {
  const g = createPaginationGuard({ maxPages: 2 });
  g.recordPage("a");
  g.recordPage("b");
  const r = g.recordPage("c");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "pagination_max_pages");
});
test("transition timeout triggers", () => {
  const g = createPaginationGuard({ transitionTimeoutMs: 1000 });
  g.markTransitionStart(1000);
  assert.deepEqual(g.checkTransitionTimeout(1500), { ok: true });
  const r = g.checkTransitionTimeout(3000);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "page_transition_timeout");
});
test("filter fingerprint is stable regardless of key order", () => {
  const a = computeFilterFingerprint({ from: "Москва", to: "Казань", weight: 200 });
  const b = computeFilterFingerprint({ weight: 200, to: "Казань", from: "Москва" });
  assert.equal(a, b);
});
test("filter fingerprint changes when value changes", () => {
  const a = computeFilterFingerprint({ weight: 200 });
  const b = computeFilterFingerprint({ weight: 201 });
  assert.notEqual(a, b);
});
