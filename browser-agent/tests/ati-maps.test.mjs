import { test } from "node:test";
import assert from "node:assert/strict";
import { matchAtiBodyType } from "../src/shared/ati-body-type-map.mjs";
import { matchAtiLoadingType } from "../src/shared/ati-loading-type-map.mjs";
import { matchAtiPaymentType } from "../src/shared/ati-payment-type-map.mjs";

test("body: tent variants", () => {
  assert.equal(matchAtiBodyType("Тент"), "tent");
  assert.equal(matchAtiBodyType("Тентованный"), "tent");
});
test("body: refrigerator", () => {
  assert.equal(matchAtiBodyType("Рефрижератор"), "refrigerator");
  assert.equal(matchAtiBodyType("реф"), "refrigerator");
});
test("body: unknown returns null", () => {
  assert.equal(matchAtiBodyType("Космолёт"), null);
});
test("loading: rear/side/top", () => {
  assert.equal(matchAtiLoadingType("Задняя"), "rear");
  assert.equal(matchAtiLoadingType("Боковая"), "side");
  assert.equal(matchAtiLoadingType("Верхняя"), "top");
});
test("loading: full tent removal", () => {
  assert.equal(matchAtiLoadingType("Полная растентовка"), "full_tent_removal");
});
test("payment: cash and cashless", () => {
  assert.equal(matchAtiPaymentType("Наличные"), "cash");
  assert.equal(matchAtiPaymentType("Безнал с НДС"), "cashless_with_vat");
  assert.equal(matchAtiPaymentType("Безнал без НДС"), "cashless_no_vat");
});
test("payment: min rate per km", () => {
  assert.equal(matchAtiPaymentType("Минимальная ставка за километр"), "min_rate_per_km");
});
