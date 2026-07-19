// Node test для agent-origins whitelist.
// Тест эмулирует esbuild-define, выставляя __RT_DEV_ORIGINS__ до импорта модуля.
import { test } from "node:test";
import assert from "node:assert/strict";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).__RT_DEV_ORIGINS__ = [
  "https://snuggle-db-bridge.lovable.app",
  "https://id-preview--d0d5cb47-0414-4a28-a4e9-a8beda3d2828.lovable.app",
];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).__RT_CHANNEL__ = "dev";

const { isTrustedAgentOrigin, normalizeOrigin } = await import("../src/agent-origins.ts");

test("trusted radius-track.ru", () => {
  assert.equal(isTrustedAgentOrigin("https://radius-track.ru"), true);
  assert.equal(isTrustedAgentOrigin("https://radius-track.ru/dispatcher/ai"), true);
});

test("trusted lovable dev origin", () => {
  assert.equal(
    isTrustedAgentOrigin("https://id-preview--d0d5cb47-0414-4a28-a4e9-a8beda3d2828.lovable.app"),
    true,
  );
});

test("localhost dev accepted", () => {
  assert.equal(isTrustedAgentOrigin("http://localhost:8080"), true);
  assert.equal(isTrustedAgentOrigin("http://127.0.0.1:5173"), true);
});

test("random lovable.app project rejected", () => {
  assert.equal(isTrustedAgentOrigin("https://other-project.lovable.app"), false);
});

test("http external rejected", () => {
  assert.equal(isTrustedAgentOrigin("http://radius-track.ru"), false);
});

test("file:// and javascript: rejected", () => {
  assert.equal(isTrustedAgentOrigin("file:///etc/passwd"), false);
  assert.equal(isTrustedAgentOrigin("javascript:alert(1)"), false);
});

test("chrome-extension:// rejected", () => {
  assert.equal(isTrustedAgentOrigin("chrome-extension://abc/index.html"), false);
});

test("normalizeOrigin strips path and lowercases", () => {
  assert.equal(normalizeOrigin("https://Radius-Track.ru/x/y?z"), "https://radius-track.ru");
});

test("empty/invalid input rejected", () => {
  assert.equal(isTrustedAgentOrigin(null), false);
  assert.equal(isTrustedAgentOrigin(""), false);
  assert.equal(isTrustedAgentOrigin("not-a-url"), false);
});
