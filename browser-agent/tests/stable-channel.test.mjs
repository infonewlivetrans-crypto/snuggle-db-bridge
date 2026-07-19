// Regression tests for stable channel separation (production cleanup 0.2.7 stage A).
// Stable bundle must NOT contain lovable.app, mock-agent helpers, pairing UI,
// legacy read/send buttons, or diagnostic controls.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("popup.stable.ts exists and has no diagnostic / pairing controls", () => {
  const src = readFileSync(path.join(root, "src", "popup.stable.ts"), "utf8");
  for (const m of ["pairing", "baseUrl", "Diagnostics", "Прочитать", "Отправить", "lovable.app"]) {
    assert.ok(!src.includes(m), `popup.stable.ts must not contain "${m}"`);
  }
  // PROD_BASE points at radius-track.ru
  assert.ok(/radius-track\.ru/.test(src));
});

test("popup.stable.html exists and is minimal", () => {
  const p = path.join(root, "popup.stable.html");
  assert.ok(existsSync(p), "popup.stable.html must exist");
  const html = readFileSync(p, "utf8");
  for (const m of ["baseUrl", "Pairing", "Прочитать", "Отправить", "Диагностика"]) {
    assert.ok(!html.includes(m), `popup.stable.html must not contain "${m}"`);
  }
});

test("esbuild.config.mjs threads RT_CHANNEL and picks stable popup entry", () => {
  const src = readFileSync(path.join(root, "esbuild.config.mjs"), "utf8");
  assert.ok(/RT_CHANNEL/.test(src));
  assert.ok(/popup\.stable\.ts/.test(src));
  assert.ok(/__RT_CHANNEL__/.test(src));
});

test("copy-static.mjs strips lovable.app hosts for stable manifest", () => {
  const src = readFileSync(path.join(root, "scripts", "copy-static.mjs"), "utf8");
  assert.ok(/channel\s*===\s*["']stable["']/.test(src));
  assert.ok(/lovable\.app/.test(src));
  assert.ok(/radius-track\.ru/.test(src));
});

test("package-extension.mjs runs forbidden-strings scan for stable", () => {
  const src = readFileSync(path.join(root, "scripts", "package-extension.mjs"), "utf8");
  for (const m of ["lovable.app", "ALLOW_MOCK_AGENT", "mockOpenAti", "mockRefreshTask", "/mock-", "Прочитать", "Отправить"]) {
    assert.ok(src.includes(m), `forbidden-strings list must include ${m}`);
  }
  assert.ok(/RT_CHANNEL/.test(src));
});

test("stable build produces bundle without forbidden strings", { timeout: 60000 }, () => {
  const buildRes = spawnSync("node", ["esbuild.config.mjs"], {
    cwd: root,
    env: { ...process.env, RT_CHANNEL: "stable" },
    encoding: "utf8",
  });
  assert.equal(buildRes.status, 0, `stable build failed: ${buildRes.stderr}`);
  const dist = path.join(root, "dist");
  const forbidden = ["lovable.app", "snuggle-db-bridge", "mockOpenAti", "mockRefreshTask", "ALLOW_MOCK_AGENT"];
  for (const f of ["popup.js", "background.js", "content.js", "web-bridge.js", "manifest.json", "popup.html"]) {
    const p = path.join(dist, f);
    if (!existsSync(p)) continue;
    const content = readFileSync(p, "utf8");
    for (const marker of forbidden) {
      assert.ok(!content.includes(marker),
        `stable dist/${f} contains forbidden marker "${marker}"`);
    }
  }
  // manifest must not have lovable.app hosts
  const m = JSON.parse(readFileSync(path.join(dist, "manifest.json"), "utf8"));
  for (const h of m.host_permissions ?? []) {
    assert.ok(!/lovable\.app|localhost/.test(h), `stable manifest host "${h}" leaks dev origin`);
  }
});
