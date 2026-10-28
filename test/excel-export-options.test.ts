import test from "node:test";
import assert from "node:assert/strict";

import { appState } from "../src/state/state.ts";
import { getDefaultExportOptions, getQuarterEndExportOptions } from "../src/services/excel-export-options.ts";

function baseSettings(overrides: any = {}) {
  return {
    theme: "dark",
    rooms: [],
    departments: [],
    accounts: [
      { code: "4100-0000-00-000", description: "Location de salle" },
      { code: "892-0000-00-000", description: "SCOLAIRE" },
      { code: "892-0000-00-001", description: "AUTRE" }
    ],
    last_backup_date: "",
    backup_reminder_days: 7,
    salaries: [],
    services: [],
    global_tasks: [],
    schedulable_tasks: [],
    tax_rates: { tps: 0.05, tvq: 0.09975 },
    ...overrides
  };
}

test("getDefaultExportOptions seeds filters from the active period and columns from every configured account", () => {
  appState.settings = baseSettings();
  appState.selected_year = "2025-2026";
  appState.selected_quarters = [2, 3];

  const options = getDefaultExportOptions();

  assert.equal(options.mode, "standard");
  assert.equal(options.filters.periodMode, "active");
  assert.equal(options.filters.fiscalYear, "2025-2026");
  assert.deepEqual(options.filters.quarters, [2, 3]);
  assert.deepEqual(options.columns.accounts, ["4100-0000-00-000", "892-0000-00-000", "892-0000-00-001"]);
  assert.equal(options.sheets.includeRoomsSheet, true);
});

test("getQuarterEndExportOptions narrows the account columns to 892-xxx codes only", () => {
  appState.settings = baseSettings();
  appState.selected_year = "2025-2026";
  appState.selected_quarters = [1, 2, 3, 4];

  const options = getQuarterEndExportOptions();

  assert.equal(options.mode, "quarter_end");
  assert.deepEqual(options.columns.accounts, ["892-0000-00-000", "892-0000-00-001"]);
  // Fixed, non-configurable shape: only id/name/date_start/references + total_revenue columns.
  assert.equal(options.columns.id, true);
  assert.equal(options.columns.responsable, false);
  assert.equal(options.columns.name, true);
  assert.equal(options.columns.references, true);
  assert.equal(options.columns.total_revenue, true);
  assert.equal(options.sheets.includeRoomsSheet, false);
});
