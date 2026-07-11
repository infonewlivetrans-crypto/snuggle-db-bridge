import { test } from "node:test";
import assert from "node:assert/strict";
import { detectRating } from "../src/shared/rating-detector.mjs";

test("semantic negative in aria-label", () => {
  const r = detectRating({ ariaLabel: "Отрицательный отзыв" });
  assert.ok(r.negative);
  assert.ok(r.confidence >= 0.5);
});
test("negativeCount > 0 marks as negative", () => {
  const r = detectRating({ negativeCount: 3 });
  assert.ok(r.negative);
});
test("stars below minStars marks as negative", () => {
  const r = detectRating({ starsCount: 2, minStars: 4 });
  assert.ok(r.negative);
});
test("neutral profile passes", () => {
  const r = detectRating({ starsCount: 5, negativeCount: 0, minStars: 4 });
  assert.ok(!r.negative);
});
test("red color alone is not enough", () => {
  const r = detectRating({ computedColor: "rgb(230, 40, 40)" });
  assert.ok(!r.negative);
  assert.ok(r.reasons.includes("red_color_hint"));
});
test("data attribute marks negative", () => {
  const r = detectRating({ dataAttrs: { isNegative: "true" } });
  assert.ok(r.negative);
});
