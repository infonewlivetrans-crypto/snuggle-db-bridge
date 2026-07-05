// Version + compatibility + manifest tests for Radius Track Browser Agent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("manifest version is 0.2.0", () => {
  const m = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8"));
  assert.equal(m.version, "0.2.0");
  assert.equal(m.manifest_version, 3);
});

test("package version is 0.2.0", () => {
  const p = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(p.version, "0.2.0");
});

test("manifest declares icon set", () => {
  const m = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8"));
  assert.ok(m.icons && m.icons["16"] && m.icons["32"] && m.icons["48"] && m.icons["128"]);
  assert.ok(m.action?.default_icon?.["128"]);
});

test("icon PNG files exist in source and dist (after build)", () => {
  for (const s of [16, 32, 48, 128]) {
    const p = path.join(root, "icons", `icon-${s}.png`);
    assert.ok(existsSync(p), `missing source icon ${s}`);
    assert.ok(statSync(p).size > 50, `icon ${s} too small`);
  }
  if (existsSync(path.join(root, "dist"))) {
    for (const s of [16, 32, 48, 128]) {
      const p = path.join(root, "dist", "icons", `icon-${s}.png`);
      assert.ok(existsSync(p), `missing dist icon ${s}`);
    }
  }
});

test("version-contract source declares required exports", () => {
  const src = readFileSync(path.join(root, "src", "version-contract.ts"), "utf8");
  assert.ok(src.includes("export function compareVersions"), "compareVersions must exist");
  assert.ok(src.includes("update_recommended"));
  assert.ok(src.includes("unsupported"));
  assert.ok(src.includes("protocol_mismatch"));
  assert.ok(src.includes("selector_config_warning"));
});

test("version.ts holds single source of truth", () => {
  const src = readFileSync(path.join(root, "src", "version.ts"), "utf8");
  assert.ok(src.includes(`AGENT_VERSION = "0.2.0"`));
  assert.ok(src.includes(`AGENT_PROTOCOL_VERSION = "1"`));
  assert.ok(src.includes(`ATI_SELECTOR_CONFIG_VERSION = "dev-1"`));
});

test("build-info payload does not include token/cookie/pairing keys", () => {
  // Проверяем именно ключи полей buildLoadedPayload, а не текст комментариев.
  const src = readFileSync(path.join(root, "src", "build-info.ts"), "utf8");
  // Извлечь тело функции buildLoadedPayload — там могут быть только безопасные поля.
  const m = src.match(/buildLoadedPayload[^{]*\{[\s\S]*?return\s*\{([\s\S]*?)\};/);
  assert.ok(m, "buildLoadedPayload return object not found");
  const body = m[1];
  for (const bad of ["token", "cookie", "pairing", "password", "secret", "authorization"]) {
    assert.ok(!new RegExp(bad, "i").test(body), `buildLoadedPayload must not include ${bad}`);
  }
});
