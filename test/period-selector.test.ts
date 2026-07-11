import test from "node:test";
import assert from "node:assert/strict";

import { getDefaultFiscalYear } from "../src/state/state.ts";
import { getFiscalYearWindow } from "../src/navigation/period-selector.ts";

test("getFiscalYearWindow always includes the current fiscal year, one year back and three years forward", () => {
  const window = getFiscalYearWindow();
  const currentStartYear = parseInt(getDefaultFiscalYear().split("-")[0], 10);

  assert.equal(window.length, 5);
  assert.deepEqual(
    window,
    [-1, 0, 1, 2, 3].map(offset => `${currentStartYear + offset}-${currentStartYear + offset + 1}`)
  );
  assert.ok(window.includes(getDefaultFiscalYear()));
});

test("getFiscalYearWindow returns contiguous, ascending fiscal years", () => {
  const window = getFiscalYearWindow();
  for (let i = 0; i < window.length - 1; i++) {
    const [, endA] = window[i].split("-");
    const [startB] = window[i + 1].split("-");
    assert.equal(endA, startB);
  }
});
