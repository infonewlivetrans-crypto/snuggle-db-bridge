// Node built-in test runner — no extra deps.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLoadText, hashText } from "../src/ati/parseLoadText.ts";
import { buildLoadDedupKey, normaliseLoadForDedup } from "../src/ati/dedup.ts";

test("parseLoadText extracts route, weight, price", () => {
  const p = parseLoadText("Москва — Санкт-Петербург · 20 т · 65 000 ₽ · 700 км · тент · безнал");
  assert.equal(p.pickup_city, "Москва");
  assert.equal(p.delivery_city, "Санкт-Петербург");
  assert.equal(p.weight, 20);
  assert.equal(p.price, 65000);
  assert.equal(p.distance_km, 700);
  assert.equal(p.body_type, "тент");
  assert.equal(p.payment_type, "безнал");
});

test("parseLoadText handles incomplete data", () => {
  const p = parseLoadText("Пермь — Ижевск · тент");
  assert.equal(p.pickup_city, "Пермь");
  assert.equal(p.delivery_city, "Ижевск");
  assert.equal(p.weight, undefined);
  assert.equal(p.body_type, "тент");
});

test("hashText is stable and hex", () => {
  const a = hashText("hello world");
  const b = hashText("hello world");
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]+$/);
});

test("buildLoadDedupKey prefers external ref", () => {
  const k = buildLoadDedupKey({ source_external_ref: "F-001", pickup_city: "Москва" });
  assert.equal(k, "ref:F-001");
});

test("buildLoadDedupKey natural key normalises", () => {
  const a = buildLoadDedupKey({ pickup_city: "Москва", delivery_city: "СПб", pickup_date: "07/07", weight: 20, price: 65000 });
  const b = buildLoadDedupKey({ pickup_city: "москва ", delivery_city: "спб", pickup_date: "07/07", weight: 20, price: 65000 });
  assert.equal(a, b);
});

test("buildLoadDedupKey falls back to hash", () => {
  const k = buildLoadDedupKey({ raw_text: "unknown load blob" });
  assert.match(k, /^hash:[0-9a-f]+$/);
});

test("normaliseLoadForDedup coerces numbers", () => {
  const n = normaliseLoadForDedup({ weight: null, price: undefined });
  assert.equal(n.weight, 0);
  assert.equal(n.price, 0);
});
