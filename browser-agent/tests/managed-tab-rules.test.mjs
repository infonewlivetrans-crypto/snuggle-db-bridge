import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canCloseManagedTab, canRestoreManagedTab, isManagedAtiTab,
} from "../src/shared/managed-tab-rules.mjs";

test("createdByAgent + matching taskId → can close", () => {
  assert.equal(canCloseManagedTab({ createdByAgent: true, searchTaskId: "t1" }, "t1"), true);
});

test("createdByAgent=false → cannot close", () => {
  assert.equal(canCloseManagedTab({ createdByAgent: false, searchTaskId: "t1" }, "t1"), false);
});

test("different taskId → cannot close", () => {
  assert.equal(canCloseManagedTab({ createdByAgent: true, searchTaskId: "t2" }, "t1"), false);
});

test("missing tabId → cannot restore", () => {
  assert.equal(canRestoreManagedTab({ createdByAgent: true }), false);
  assert.equal(canRestoreManagedTab({ createdByAgent: true, tabId: 0 }), false);
});

test("valid record → can restore", () => {
  assert.equal(canRestoreManagedTab({ createdByAgent: true, tabId: 42 }), true);
});

test("ATI URL recognized", () => {
  assert.equal(isManagedAtiTab({ url: "https://loads.ati.su/loadsearch" }), true);
  assert.equal(isManagedAtiTab({ url: "https://ati.su/loads" }), true);
});

test("unknown URL not ATI", () => {
  assert.equal(isManagedAtiTab({ url: "https://example.com" }), false);
  assert.equal(isManagedAtiTab({ url: "not a url" }), false);
});
