const test = require("node:test");
const assert = require("node:assert/strict");
const { getFiscalYear, getQuarterNumber, getQuarter, parseLocalDateStr } = require("../js/state.js");

test("getFiscalYear: July onward belongs to the year that just started", () => {
  assert.equal(getFiscalYear("2025-07-01"), "2025-2026");
  assert.equal(getFiscalYear("2025-08-15"), "2025-2026");
  assert.equal(getFiscalYear("2025-12-31"), "2025-2026");
});

test("getFiscalYear: January through June belongs to the year that's ending", () => {
  assert.equal(getFiscalYear("2025-01-01"), "2024-2025");
  assert.equal(getFiscalYear("2025-06-30"), "2024-2025");
});

test("getFiscalYear returns an empty string for missing/invalid dates", () => {
  assert.equal(getFiscalYear(""), "");
  assert.equal(getFiscalYear("not-a-date"), "");
});

test("getQuarterNumber maps months to fiscal quarters (Q1 = Jul-Sep)", () => {
  assert.equal(getQuarterNumber("2025-07-01"), 1);
  assert.equal(getQuarterNumber("2025-09-30"), 1);
  assert.equal(getQuarterNumber("2025-10-01"), 2);
  assert.equal(getQuarterNumber("2025-12-31"), 2);
  assert.equal(getQuarterNumber("2025-01-01"), 3);
  assert.equal(getQuarterNumber("2025-03-31"), 3);
  assert.equal(getQuarterNumber("2025-04-01"), 4);
  assert.equal(getQuarterNumber("2025-06-30"), 4);
});

test("getQuarter returns the matching human-readable label", () => {
  assert.equal(getQuarter("2025-08-01"), "T1 (Jul-Sep)");
  assert.equal(getQuarter("2025-11-01"), "T2 (Oct-Dec)");
  assert.equal(getQuarter("2025-02-01"), "T3 (Jan-Mar)");
  assert.equal(getQuarter("2025-05-01"), "T4 (Apr-Jun)");
});

test("parseLocalDateStr avoids the UTC-midnight off-by-one for YYYY-MM-DD strings", () => {
  const date = parseLocalDateStr("2025-03-10");
  assert.equal(date.getFullYear(), 2025);
  assert.equal(date.getMonth(), 2); // 0-indexed: March
  assert.equal(date.getDate(), 10);
});
