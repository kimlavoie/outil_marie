import test from "node:test";
import assert from "node:assert/strict";
import { formatDateStrLocal, parseLocalDateStr, getFiscalYearRange, getDefaultFiscalYear, getFiscalYear } from "../src/state/date-helpers.ts";

test("formatDateStrLocal round-trips with parseLocalDateStr", () => {
  assert.equal(formatDateStrLocal(parseLocalDateStr("2025-08-01")), "2025-08-01");
  assert.equal(formatDateStrLocal(parseLocalDateStr("2025-12-31")), "2025-12-31");
});

test("formatDateStrLocal pads single-digit month and day", () => {
  assert.equal(formatDateStrLocal(new Date(2024, 0, 5)), "2024-01-05");
});

test("getFiscalYearRange returns July 1 to June 30 bounds for a fiscal year string", () => {
  assert.deepEqual(getFiscalYearRange("2024-2025"), { start: "2024-07-01", end: "2025-06-30" });
});

test("getFiscalYearRange returns null for missing or malformed input", () => {
  assert.equal(getFiscalYearRange(""), null);
  assert.equal(getFiscalYearRange("2024"), null);
  assert.equal(getFiscalYearRange("not-a-year"), null);
});

test("getDefaultFiscalYear agrees with getFiscalYear for today's date", () => {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  assert.equal(getDefaultFiscalYear(), getFiscalYear(`${y}-${m}-${d}`));
});

export {};
