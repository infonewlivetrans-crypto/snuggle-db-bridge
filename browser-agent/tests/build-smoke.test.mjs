// Smoke test: verify build produces expected dist artifacts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "dist");

test("dist/ contains built extension artifacts", () => {
  for (const f of ["manifest.json", "popup.html", "background.js", "content.js", "popup.js"]) {
    const p = path.join(dist, f);
    assert.ok(existsSync(p), `missing ${f}`);
    assert.ok(statSync(p).size > 0, `${f} is empty`);
  }
});
