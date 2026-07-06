const test = require("node:test");
const assert = require("node:assert/strict");

// dashboard.js's computeDashboardStats() calls getFiscalYear/getQuarterNumber/getRoomsTariffTotal
// as globals (they're plain <script> globals in the browser); wire them up before requiring it.
const { getFiscalYear, getQuarterNumber } = require("../js/state.js");
const { getRoomsTariffTotal } = require("../js/utils.js");
global.getFiscalYear = getFiscalYear;
global.getQuarterNumber = getQuarterNumber;
global.getRoomsTariffTotal = getRoomsTariffTotal;
const { computeDashboardStats } = require("../js/dashboard.js");

const YEAR = "2025-2026";
const ALL_QUARTERS = [1, 2, 3, 4];

test("sums revenue and counts only filled activities within the selected period", () => {
  const activities = [
    { name: "Activité A", date_start: "2025-08-01", client_type: "externe", distributions: [{ amount: 100 }, { amount: 50 }] },
    { name: "", date_start: "2025-08-01", client_type: "externe", distributions: [{ amount: 999 }] }, // blank: ignored
    { name: "Activité B", date_start: "2024-08-01", client_type: "externe", distributions: [{ amount: 999 }] } // wrong fiscal year: ignored
  ];

  const stats = computeDashboardStats(activities, YEAR, ALL_QUARTERS, []);
  assert.equal(stats.totalRevenue, 150);
  assert.equal(stats.filledCount, 1);
});

test("values free internal bookings at their room tariff when no revenue was charged", () => {
  const activities = [
    {
      name: "Réunion interne",
      date_start: "2025-08-01",
      client_type: "interne",
      distributions: [], // no revenue recorded
      rooms: [{ date_start: "2025-08-01", date_end: "2025-08-01", tariff_amount: 175 }]
    }
  ];

  const stats = computeDashboardStats(activities, YEAR, ALL_QUARTERS, []);
  assert.equal(stats.totalInternalFree, 175);
});

test("does not value internal bookings that were actually charged", () => {
  const activities = [
    {
      name: "Réunion interne facturée",
      date_start: "2025-08-01",
      client_type: "interne",
      distributions: [{ amount: 50 }],
      rooms: [{ date_start: "2025-08-01", date_end: "2025-08-01", tariff_amount: 175 }]
    }
  ];

  const stats = computeDashboardStats(activities, YEAR, ALL_QUARTERS, []);
  assert.equal(stats.totalInternalFree, 0);
});

test("computes the reconciliation rate as valid / (all app-side records)", () => {
  const reconciliationResults = [
    { status: "valid" },
    { status: "valid" },
    { status: "diff" },
    { status: "unentered" } // excluded from the denominator: not an app-side record
  ];

  const stats = computeDashboardStats([], YEAR, ALL_QUARTERS, reconciliationResults);
  assert.equal(stats.reconciliationRate, 67); // 2/3 rounded
});

test("reconciliation rate is 0 when there are no results yet", () => {
  const stats = computeDashboardStats([], YEAR, ALL_QUARTERS, []);
  assert.equal(stats.reconciliationRate, 0);
});
