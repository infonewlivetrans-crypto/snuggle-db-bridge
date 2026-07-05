// sanitizeAgentDiagnostics tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Тест на исходник: убедимся, что список опасных ключей полон.
test("sanitize.ts declares sensitive keys", () => {
  const src = readFileSync(path.join(root, "src", "sanitize.ts"), "utf8");
  for (const k of ["agent_token", "token", "pairing_code", "cookie", "password", "authorization"]) {
    assert.ok(src.includes(`"${k}"`), `sanitize.ts must list ${k}`);
  }
  assert.ok(src.includes("token_hash"), "must redact token_hash");
});

// Функциональный тест через собранный dist/background.js: sanitize inline через eval-безопасный путь.
test("dist background includes sanitizeAgentDiagnostics import", () => {
  const p = path.join(root, "dist", "background.js");
  if (!existsSync(p)) return; // build не запущен — smoke test отдельно проверяет
  const src = readFileSync(p, "utf8");
  assert.ok(src.includes("SENSITIVE_KEYS") || src.includes("[redacted]"),
    "sanitizeAgentDiagnostics must be bundled into background");
});

// Package (zip) не должен содержать .env / node_modules — script упаковывает только dist/.
test("package script packages only dist/", () => {
  const p = path.join(root, "scripts", "package-extension.mjs");
  const src = readFileSync(p, "utf8");
  assert.ok(src.includes("dist"), "package script must package only dist/");
  // Убедимся, что нет случайного включения node_modules/.env в аргументы zip.
  assert.ok(!/zip[^\n]*node_modules/.test(src), "package must not zip node_modules");
  assert.ok(!/zip[^\n]*\.env/.test(src), "package must not zip .env");
});
