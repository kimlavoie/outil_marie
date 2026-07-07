import test from "node:test";
import assert from "node:assert/strict";
import { logError, logWarn, logInfo, getLogHistory } from "../js/logger.js";

test("logError/logWarn/logInfo append structured entries to the log history", () => {
  const before = getLogHistory().length;
  logError("test-module", "une action ratée", { cause: "test" });
  logWarn("test-module", "un avertissement");
  logInfo("test-module", "une info");

  const history = getLogHistory();
  assert.equal(history.length, before + 3);

  const [err, warn, info] = history.slice(-3);
  assert.equal(err.level, "error");
  assert.equal(err.module, "test-module");
  assert.equal(err.action, "une action ratée");
  assert.deepEqual(err.details, { cause: "test" });
  assert.ok(err.timestamp);

  assert.equal(warn.level, "warn");
  assert.equal(info.level, "info");
});

test("getLogHistory returns a copy that callers can't mutate", () => {
  const history = getLogHistory();
  const originalLength = history.length;
  history.push({ level: "error", module: "fake", action: "fake" });
  assert.equal(getLogHistory().length, originalLength);
});
