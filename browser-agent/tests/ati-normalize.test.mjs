import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWeightForAti,
  parseAtiWeightTonsToKg,
  weightsEquivalentKg,
  normalizeVolumeForAti,
  parseAtiVolume,
  volumesEquivalent,
  resolveLoadDateMode,
} from "../src/shared/ati-normalize.mjs";

test("200 kg -> 0,2 t (ru)", () => {
  assert.equal(normalizeWeightForAti(200), "0,2");
  assert.equal(normalizeWeightForAti(200, "en"), "0.2");
});
test("1500 kg -> 1,5 t", () => assert.equal(normalizeWeightForAti(1500), "1,5"));
test("20000 kg -> 20", () => assert.equal(normalizeWeightForAti(20000), "20"));
test("invalid weight -> null", () => {
  assert.equal(normalizeWeightForAti(0), null);
  assert.equal(normalizeWeightForAti(-5), null);
  assert.equal(normalizeWeightForAti("abc"), null);
});

test("parse tons string back to kg (comma and dot)", () => {
  assert.equal(parseAtiWeightTonsToKg("0,2"), 200);
  assert.equal(parseAtiWeightTonsToKg("0.2"), 200);
  assert.equal(parseAtiWeightTonsToKg("1,5"), 1500);
  assert.equal(parseAtiWeightTonsToKg(" 20 "), 20000);
});

test("weights equivalence tolerance 1kg", () => {
  assert.ok(weightsEquivalentKg(200, 200));
  assert.ok(weightsEquivalentKg(200, 201));
  assert.ok(!weightsEquivalentKg(200, 210));
});

test("volume normalization keeps decimals", () => {
  assert.equal(normalizeVolumeForAti(0.5), "0,5");
  assert.equal(normalizeVolumeForAti(12.7), "12,7");
  assert.equal(parseAtiVolume("12,7"), 12.7);
  assert.ok(volumesEquivalent(12.7, 12.7));
});

test("resolveLoadDateMode: today", () => {
  const r = resolveLoadDateMode({ mode: "today" }, "2026-07-11");
  assert.deepEqual(r, { textCandidates: ["сегодня"], from: "2026-07-11", to: "2026-07-11" });
});
test("resolveLoadDateMode: today_tomorrow", () => {
  const r = resolveLoadDateMode({ mode: "today_tomorrow" }, "2026-07-11");
  assert.equal(r.to, "2026-07-12");
});
test("resolveLoadDateMode: from_tomorrow", () => {
  const r = resolveLoadDateMode({ mode: "from_tomorrow" }, "2026-07-11");
  assert.equal(r.from, "2026-07-12");
  assert.equal(r.to, null);
});
test("resolveLoadDateMode: exact", () => {
  const r = resolveLoadDateMode({ mode: "exact", exactDates: ["2026-07-15"] }, "2026-07-11");
  assert.deepEqual(r.exactDates, ["2026-07-15"]);
});
