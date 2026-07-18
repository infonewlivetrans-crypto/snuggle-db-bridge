// Регрессионные проверки overlay-панели агента.
// Убеждаемся, что CSS кладётся в отдельный <style>.textContent,
// используется Shadow DOM, нет legacy-кнопок «Прочитать»/«Отправить»,
// и селектор `all:initial` не применяется к `*` (это делало <style>
// видимым как текст на странице ATI).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const overlaySrc = readFileSync(
  path.join(root, "src", "ati", "agentOverlay.ts"),
  "utf8",
);
const contentSrc = readFileSync(
  path.join(root, "src", "content.ts"),
  "utf8",
);

test("overlay uses attachShadow with open mode", () => {
  assert.ok(/attachShadow\(\{\s*mode:\s*["']open["']/.test(overlaySrc));
});

test("overlay CSS is applied via a dedicated <style>.textContent", () => {
  assert.ok(/createElement\(["']style["']\)/.test(overlaySrc));
  assert.ok(/styleEl\.textContent\s*=\s*OVERLAY_CSS/.test(overlaySrc));
});

test("overlay never injects CSS via innerHTML/insertAdjacentHTML", () => {
  // Никакого shadow.innerHTML со стилями и никакого insertAdjacentHTML вообще.
  assert.ok(!/shadow\.innerHTML/.test(overlaySrc));
  assert.ok(!/insertAdjacentHTML/.test(overlaySrc));
  // uiRoot очищается через removeChild, не через innerHTML="".
  assert.ok(!/\.innerHTML\s*=/.test(overlaySrc));
});

test("overlay does not apply `all: initial` to `*` selector", () => {
  // Такой сброс делает <style> display:inline, и CSS показывается как текст.
  assert.ok(!/:host\s*,\s*\*\s*\{\s*all:\s*initial/.test(overlaySrc));
  assert.ok(!/\*\s*\{\s*all:\s*initial/.test(overlaySrc));
});

test("overlay uses stable host id radius-track-agent-host", () => {
  assert.ok(/HOST_ID\s*=\s*["']radius-track-agent-host["']/.test(overlaySrc));
});

test("overlay strips legacy hosts", () => {
  assert.ok(/LEGACY_HOST_IDS/.test(overlaySrc));
  assert.ok(/rt-agent-overlay-host/.test(overlaySrc));
});

test("overlay has no «Прочитать» / «Отправить» buttons", () => {
  assert.ok(!/Прочитать/.test(overlaySrc));
  assert.ok(!/Отправить/.test(overlaySrc));
  assert.ok(!/data-a=["'](read|send)["']/.test(overlaySrc));
});

test("content script does not wire read/send overlay actions", () => {
  assert.ok(!/a === "read"/.test(contentSrc));
  assert.ok(!/a === "send"/.test(contentSrc));
});
