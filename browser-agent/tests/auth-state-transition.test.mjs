import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAuthState, shouldEmitLoginRequired, shouldEmitLoginDetected,
} from "../src/shared/auth-state-transition.mjs";

test("normalize: unknown fallback", () => {
  assert.equal(normalizeAuthState(null), "unknown");
  assert.equal(normalizeAuthState("weird"), "unknown");
  assert.equal(normalizeAuthState("AUTHENTICATED"), "authenticated");
});

test("login_required → authenticated emits login_detected", () => {
  assert.equal(shouldEmitLoginDetected("login_required", "authenticated"), true);
});

test("authenticated → authenticated: no detected", () => {
  assert.equal(shouldEmitLoginDetected("authenticated", "authenticated"), false);
});

test("unknown → authenticated: no false detected", () => {
  assert.equal(shouldEmitLoginDetected("unknown", "authenticated"), false);
});

test("authenticated → login_required emits login_required", () => {
  assert.equal(shouldEmitLoginRequired("authenticated", "login_required"), true);
});

test("unknown → login_required also emits (first observation)", () => {
  assert.equal(shouldEmitLoginRequired("unknown", "login_required"), true);
});

test("login_required → login_required: no re-emit", () => {
  assert.equal(shouldEmitLoginRequired("login_required", "login_required"), false);
});
