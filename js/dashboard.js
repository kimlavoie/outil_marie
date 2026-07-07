/**
 * dashboard.js - Dashboard view KPI computation (pure, no DOM, unit-tested directly).
 * The rendering (stat cards, Chart.js visualizations) and the window.renderDashboard()/
 * window.renderDashboardCharts() bridge navigation.js calls live in js/dashboard-view.tsx
 * (React, since Phase 3 of the Vite/React/TS migration — see TODO.txt).
 *
 * Kept as a separate plain .js module (rather than folded into dashboard-view.tsx) so the test
 * suite can still import computeDashboardStats through plain `node --test`: Node's built-in
 * TypeScript support strips .ts but can't execute .tsx (JSX needs a real transform, not just
 * type erasure), so nothing reachable from a test file's import graph can be a .tsx module.
 */

// Pure KPI computation (no DOM) so it can be unit tested directly.
function computeDashboardStats(activities, selectedYear, selectedQuarters, reconciliationResults) {
  let totalRevenue = 0;
  let totalInternalFree = 0;
  let filledCount = 0;

  activities.forEach(act => {
    if (act.deleted) return;
    const isFilled = act.name.trim() !== "";
    if (!isFilled) return;

    // Period filter
    const actYear = getFiscalYear(act.date_start);
    const actQuarter = getQuarterNumber(act.date_start);
    if (actYear !== selectedYear || !selectedQuarters.includes(actQuarter)) {
      return;
    }

    filledCount++;

    // Revenue sum for this activity
    const activityRevenue = act.distributions.reduce((sum, dist) => sum + dist.amount, 0);
    totalRevenue += activityRevenue;

    // Internal free valuation: client is internal, and no actual charge (revenue is zero)
    if (act.client_type === "interne" && activityRevenue === 0) {
      totalInternalFree += getRoomsTariffTotal(act);
    }
  });

  // Reconciliation Rate
  let reconciliationRate = 0;
  if (reconciliationResults.length > 0) {
    const validCount = reconciliationResults.filter(r => r.status === "valid").length;
    // Rate is valid divided by total matched records in ledger/application
    // Let's filter records that are relevant (exclude ledger-only missing entries)
    const appRecordsCount = reconciliationResults.filter(r => r.status !== "unentered").length;
    if (appRecordsCount > 0) {
      reconciliationRate = Math.round((validCount / appRecordsCount) * 100);
    }
  }

  return { totalRevenue, totalInternalFree, filledCount, reconciliationRate };
}

export { computeDashboardStats };
if (typeof window !== "undefined") {
  window.computeDashboardStats = computeDashboardStats;
}
