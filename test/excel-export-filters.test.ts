import test from "node:test";
import assert from "node:assert/strict";

import { appState } from "../src/state/state.ts";
import { getDefaultExportOptions, getQuarterEndExportOptions } from "../src/services/excel-export-options.ts";
import { filterActivitiesForExport, getQuarterEndActivities, getQuarterEndReconciliationCellRefs } from "../src/services/excel-export-filters.ts";
import { reconciliationState } from "../src/services/reconciliation.ts";

function baseSettings(overrides: any = {}) {
  return {
    theme: "dark",
    rooms: [],
    departments: [],
    accounts: [
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

function makeActivity(overrides: any = {}) {
  return {
    id: "act-1",
    name: "Activité test",
    responsable: "Jean Dupont",
    date_start: "2025-08-01",
    date_end: "2025-08-01",
    client_type: "interne",
    category: "",
    department: "",
    deleted: false,
    reservations: [],
    distributions: [],
    ...overrides
  };
}

test("filterActivitiesForExport drops deleted and blank-name activities regardless of other filters", () => {
  appState.settings = baseSettings();
  const options = getDefaultExportOptions();
  const filters = { ...options.filters, periodMode: "all" as const };
  const activities = [makeActivity({ id: "a1", deleted: true }), makeActivity({ id: "a2", name: "" }), makeActivity({ id: "a3" })];
  const result = filterActivitiesForExport(activities, filters);
  assert.deepEqual(result.map(a => a.id), ["a3"]);
});

test("filterActivitiesForExport 'active' period mode keeps only activities in the selected fiscal year/quarters", () => {
  appState.settings = baseSettings();
  appState.selected_year = "2025-2026";
  appState.selected_quarters = [1]; // juillet-septembre
  const options = getDefaultExportOptions();
  const activities = [
    makeActivity({ id: "in-period", date_start: "2025-08-01" }),
    makeActivity({ id: "out-of-quarter", date_start: "2026-02-01" }),
    makeActivity({ id: "out-of-year", date_start: "2024-08-01" })
  ];
  const result = filterActivitiesForExport(activities, options.filters);
  assert.deepEqual(result.map(a => a.id), ["in-period"]);
});

test("filterActivitiesForExport financial filter: with_revenue / zero_revenue", () => {
  appState.settings = baseSettings();
  const options = getDefaultExportOptions();
  const activities = [
    makeActivity({ id: "with-rev", distributions: [{ account_code: "892-0000-00-000", amount: 100 }] }),
    makeActivity({ id: "zero-rev", distributions: [] })
  ];

  const withRevenue = filterActivitiesForExport(activities, { ...options.filters, periodMode: "all", financialFilter: "with_revenue" });
  assert.deepEqual(withRevenue.map(a => a.id), ["with-rev"]);

  const zeroRevenue = filterActivitiesForExport(activities, { ...options.filters, periodMode: "all", financialFilter: "zero_revenue" });
  assert.deepEqual(zeroRevenue.map(a => a.id), ["zero-rev"]);
});

test("filterActivitiesForExport searchText matches name, id and invoice references", () => {
  appState.settings = baseSettings();
  const options = getDefaultExportOptions();
  const activities = [
    makeActivity({ id: "act-42", name: "Spectacle de musique" }),
    makeActivity({ id: "act-99", name: "Réunion" })
  ];
  const result = filterActivitiesForExport(activities, { ...options.filters, periodMode: "all", searchText: "musique" });
  assert.deepEqual(result.map(a => a.id), ["act-42"]);
});

test("getQuarterEndActivities keeps only 892-xxx accounts actually carrying a non-zero amount, and drops zero-total rows", () => {
  appState.settings = baseSettings();
  appState.selected_year = "2025-2026";
  appState.selected_quarters = [1, 2, 3, 4];
  appState.activities = [
    makeActivity({ id: "a1", distributions: [{ account_code: "892-0000-00-000", amount: 200 }] }),
    makeActivity({
      id: "a2",
      // Two lines on the same account that cancel out: this activity's own net total is 0,
      // so it's excluded even though the account itself stays selected (a1 carries an amount).
      distributions: [
        { account_code: "892-0000-00-000", amount: 100 },
        { account_code: "892-0000-00-000", amount: -100 }
      ]
    }),
    makeActivity({ id: "a3", distributions: [] })
  ];
  const options = getQuarterEndExportOptions();

  const { activities, selectedAccounts } = getQuarterEndActivities(options);

  assert.deepEqual(activities.map(a => a.id), ["a1"]);
  assert.deepEqual(selectedAccounts, ["892-0000-00-000"]);
});

test("getQuarterEndReconciliationCellRefs maps unresolved diff/unlogged results to their cell refs", () => {
  appState.settings = baseSettings();
  const activities = [makeActivity({ id: "a1" }), makeActivity({ id: "a2" })];
  const selectedAccounts = ["892-0000-00-000", "892-0000-00-001"];

  reconciliationState.results = [
    { activityId: "a1", account_code: "892-0000-00-000", status: "diff" },
    { activityId: "a2", account_code: "892-0000-00-001", status: "unlogged" }
  ];

  const { diffCellRefs, unloggedCellRefs } = getQuarterEndReconciliationCellRefs(activities, selectedAccounts);

  // Row 1 = a1 (rIdx 0 -> row 2), column A = QUARTER_END_FROZEN_COLS(4) + accIdx(0) + 1 = col E.
  assert.ok(diffCellRefs.has("E2"));
  // Row 2 = a2 (rIdx 1 -> row 3), second account column -> col F.
  assert.ok(unloggedCellRefs.has("F3"));

  reconciliationState.results = [];
});
