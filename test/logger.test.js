import test from "node:test";
import assert from "node:assert/strict";
import { logError, logWarn, logInfo, getLogHistory } from "../js/logger.ts";

test("logError/logWarn/logInfo append structured entries to the log history", () => {
  const before = getLogHistory().length;
  logError("test-module", "une action ratée", { cause: "test" });
  logWarn("test-module", "un avertissement", { cause: "warn" });
  logInfo("test-module", "une info", { cause: "info" });

  const history = getLogHistory();
  assert.equal(history.length, before + 3);

  const [err, warn, info] = history.slice(-3);
  assert.equal(err.level, "error");
  assert.equal(err.module, "test-module");
  assert.equal(err.action, "une action ratée");
  assert.deepEqual(err.details, { cause: "test" });
  assert.ok(err.timestamp);

  assert.equal(warn.level, "warn");
  assert.deepEqual(warn.details, { cause: "warn" });
  assert.equal(info.level, "info");
  assert.deepEqual(info.details, { cause: "info" });
});

test("getLogHistory returns a copy that callers can't mutate", () => {
  const history = getLogHistory();
  const originalLength = history.length;
  history.push({ level: "error", module: "fake", action: "fake" });
  assert.equal(getLogHistory().length, originalLength);
});

test("logHistory truncates at LOG_HISTORY_LIMIT", () => {
  // Push 205 logs
  for (let i = 0; i < 205; i++) {
    logInfo("limit-test", `log-${i}`);
  }
  const history = getLogHistory();
  assert.equal(history.length, 200);
  assert.equal(history[0].action, "log-5");
  assert.equal(history[199].action, "log-204");
});

test("log methods handle undefined details correctly", () => {
  logError("test-undef", "error-msg");
  logWarn("test-undef", "warn-msg");
  logInfo("test-undef", "info-msg");

  const history = getLogHistory();
  const [err, warn, info] = history.slice(-3);
  assert.equal(err.details, undefined);
  assert.equal(warn.details, undefined);
  assert.equal(info.details, undefined);
});

