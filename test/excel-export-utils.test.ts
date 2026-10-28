import test from "node:test";
import assert from "node:assert/strict";

import { getExcelColName, getRevenueLines, QUARTER_END_FROZEN_COLS } from "../src/services/excel-export-utils.ts";

test("getExcelColName converts 1-based indices to Excel letters, wrapping past Z", () => {
  assert.equal(getExcelColName(1), "A");
  assert.equal(getExcelColName(26), "Z");
  assert.equal(getExcelColName(27), "AA");
  assert.equal(getExcelColName(52), "AZ");
  assert.equal(getExcelColName(702), "ZZ");
  assert.equal(getExcelColName(703), "AAA");
});

test("getRevenueLines combines billing distributions and bar revenue lines", () => {
  const act = {
    distributions: [{ account_code: "4100", amount: 50 }],
    bar_revenue_lines: [{ account_code: "4200", amount: 25 }]
  };
  assert.deepEqual(getRevenueLines(act), [
    { account_code: "4100", amount: 50 },
    { account_code: "4200", amount: 25 }
  ]);
});

test("getRevenueLines tolerates missing distributions/bar_revenue_lines", () => {
  assert.deepEqual(getRevenueLines({}), []);
  assert.deepEqual(getRevenueLines({ distributions: [{ account_code: "4100", amount: 10 }] }), [
    { account_code: "4100", amount: 10 }
  ]);
});

test("QUARTER_END_FROZEN_COLS is the fixed leading-column count (id, name, date_start, references)", () => {
  assert.equal(QUARTER_END_FROZEN_COLS, 4);
});
