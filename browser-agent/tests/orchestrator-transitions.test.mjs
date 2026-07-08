import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getNextOrchestrationStep,
  canAdvanceOrchestration,
  mapCommandFailureToErrorCode,
  mapOrchestrationStatusToSimpleStage,
  containsSensitiveFields,
  normalizeRefreshIntervalSeconds,
  isTerminalOrchestrationStatus,
  isActiveOrchestrationStatus,
} from "../src/shared/orchestrator-transitions.mjs";

test("isTerminal: failed/stopped/suitable_found", () => {
  for (const s of ["failed", "stopped", "suitable_found"]) {
    assert.equal(isTerminalOrchestrationStatus(s), true, s);
  }
  assert.equal(isTerminalOrchestrationStatus("searching"), false);
  assert.equal(isTerminalOrchestrationStatus(null), false);
});

test("isActive: active states", () => {
  for (const s of ["opening_ati", "applying_filters", "starting_search", "waiting_results", "reading_loads", "scoring", "searching"]) {
    assert.equal(isActiveOrchestrationStatus(s), true, s);
  }
  assert.equal(isActiveOrchestrationStatus("paused"), false);
  assert.equal(isActiveOrchestrationStatus("waiting_user_login"), false);
});


test("open_ati → apply_filters", () => {
  const n = getNextOrchestrationStep("open_ati");
  assert.equal(n?.commandType, "apply_filters");
  assert.equal(n?.nextStatus, "applying_filters");
});

test("apply_filters → start_search", () => {
  assert.equal(getNextOrchestrationStep("apply_filters")?.commandType, "start_search");
});

test("start_search → read_visible_loads", () => {
  assert.equal(getNextOrchestrationStep("start_search")?.commandType, "read_visible_loads");
});

test("read_visible_loads → null (terminal for initial cycle)", () => {
  assert.equal(getNextOrchestrationStep("read_visible_loads"), null);
});

test("canAdvance: false for paused/stopped/failed/waiting_user_login/suitable_found/idle", () => {
  for (const s of ["paused", "stopped", "failed", "waiting_user_login", "suitable_found", "idle"]) {
    assert.equal(canAdvanceOrchestration(s), false, s);
  }
  assert.equal(canAdvanceOrchestration("opening_ati"), true);
  assert.equal(canAdvanceOrchestration(null), false);
});

test("mapCommandFailure: expired → agent_timeout", () => {
  assert.equal(mapCommandFailureToErrorCode("open_ati", null, "expired"), "agent_timeout");
});

test("mapCommandFailure: login message → ati_login_required", () => {
  assert.equal(mapCommandFailureToErrorCode("open_ati", "user login required", "failed"), "ati_login_required");
});

test("mapCommandFailure: fallback by type", () => {
  assert.equal(mapCommandFailureToErrorCode("apply_filters", "boom", "failed"), "filters_apply_failed");
  assert.equal(mapCommandFailureToErrorCode("start_search", "boom", "failed"), "search_start_failed");
  assert.equal(mapCommandFailureToErrorCode("read_visible_loads", "boom", "failed"), "extraction_failed");
});

test("mapOrchestrationStatusToSimpleStage: idle fallback", () => {
  assert.equal(mapOrchestrationStatusToSimpleStage(null), "idle");
  assert.equal(mapOrchestrationStatusToSimpleStage("searching"), "searching");
});

test("containsSensitiveFields: token/password/authorization detected", () => {
  assert.equal(containsSensitiveFields({ agent_token: "abc" }), true);
  assert.equal(containsSensitiveFields({ Authorization: "Bearer x" }), true);
  assert.equal(containsSensitiveFields({ ok: true, matched_count: 3 }), false);
});

test("normalizeRefreshIntervalSeconds: floor 60, cap 3600", () => {
  assert.equal(normalizeRefreshIntervalSeconds(10), 60);
  assert.equal(normalizeRefreshIntervalSeconds(59), 60);
  assert.equal(normalizeRefreshIntervalSeconds(60), 60);
  assert.equal(normalizeRefreshIntervalSeconds(120), 120);
  assert.equal(normalizeRefreshIntervalSeconds(9999), 3600);
  assert.equal(normalizeRefreshIntervalSeconds(null), 60);
  assert.equal(normalizeRefreshIntervalSeconds(undefined), 60);
});
