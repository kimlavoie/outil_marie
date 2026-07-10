/**
 * dashboard.ts - Dashboard view KPI computation (pure, no DOM, unit-tested directly).
 * The rendering (stat cards, Chart.js visualizations) resides in src/components/dashboard-view.tsx (React).
 *
 * Kept as a separate plain .ts module (rather than folded into dashboard-view.tsx) so the test
 * suite can still import computeDashboardStats through plain test runners: Node's built-in
 * TypeScript support strips .ts but does not execute JSX.
 */
import { getFiscalYear, getQuarterNumber, getActiveSalaryRate, getActiveSalaryOvertimeRate } from "./state/state.ts";
import { getRoomsTariffTotal } from "./utils/utils.ts";

// Pure KPI computation (no DOM) so it can be unit tested directly.
function computeDashboardStats(activities: any[], selectedYear: string, selectedQuarters: number[], reconciliationResults: any[]) {
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
    if (actYear !== selectedYear || actQuarter === null || !selectedQuarters.includes(actQuarter)) {
      return;
    }

    filledCount++;

    // Revenue sum for this activity
    const activityRevenue = act.distributions.reduce((sum: number, dist: any) => sum + dist.amount, 0);
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

function computeEmployeeStats(
  employeeId: string,
  activities: any[],
  selectedYear: string,
  selectedQuarters: number[],
  salariesList: any[]
) {
  let totalNormalHours = 0;
  let totalOvertimeHours = 0;
  let totalAmount = 0;

  const quarterDetails: Record<number, { normalHours: number; overtimeHours: number; amount: number }> = {
    1: { normalHours: 0, overtimeHours: 0, amount: 0 },
    2: { normalHours: 0, overtimeHours: 0, amount: 0 },
    3: { normalHours: 0, overtimeHours: 0, amount: 0 },
    4: { normalHours: 0, overtimeHours: 0, amount: 0 }
  };

  const activityMap: Record<
    string,
    { id: string; name: string; date: string; normalHours: number; overtimeHours: number; amount: number }
  > = {};

  const selectedSalary = salariesList.find(s => s.id === employeeId);

  activities.forEach(act => {
    if (act.deleted) return;
    const isFilled = act.name.trim() !== "";
    if (!isFilled) return;

    // Period filter
    const actYear = getFiscalYear(act.date_start);
    const actQuarter = getQuarterNumber(act.date_start);
    if (actYear !== selectedYear || actQuarter === null) {
      return;
    }

    const reservations = act.reservations || [];
    reservations.forEach((r: any) => {
      (r.staff || []).forEach((s: any) => {
        if (s.salary_id === employeeId) {
          const normalHrs = (s.hours || 0) * (s.count || 0);
          const overtimeHrs = (s.overtime_hours || 0) * (s.count || 0);

          let rate = 0;
          let overtimeRate = 0;
          if (s.tarif_id === "__custom__") {
            rate = s.custom_rate || 0;
            overtimeRate = s.custom_overtime_rate || 0;
          } else {
            rate = selectedSalary ? getActiveSalaryRate(selectedSalary, act.date_start, s.tarif_id) : 0;
            overtimeRate = selectedSalary ? getActiveSalaryOvertimeRate(selectedSalary, act.date_start, s.tarif_id) : 0;
          }

          const normalCost = rate * normalHrs;
          const overtimeCost = overtimeRate * overtimeHrs;
          const totalCost = normalCost + overtimeCost;

          // Add to quarterDetails
          if (quarterDetails[actQuarter]) {
            quarterDetails[actQuarter].normalHours += normalHrs;
            quarterDetails[actQuarter].overtimeHours += overtimeHrs;
            quarterDetails[actQuarter].amount += totalCost;
          }

          // If the quarter is in selectedQuarters, add to totals and contributing activities
          if (selectedQuarters.includes(actQuarter)) {
            totalNormalHours += normalHrs;
            totalOvertimeHours += overtimeHrs;
            totalAmount += totalCost;

            if (!activityMap[act.id]) {
              activityMap[act.id] = {
                id: act.id,
                name: act.name,
                date: act.date_start,
                normalHours: 0,
                overtimeHours: 0,
                amount: 0
              };
            }
            activityMap[act.id].normalHours += normalHrs;
            activityMap[act.id].overtimeHours += overtimeHrs;
            activityMap[act.id].amount += totalCost;
          }
        }
      });
    });
  });

  const contributingActivities = Object.values(activityMap).sort((a, b) => b.date.localeCompare(a.date));

  return {
    totalNormalHours,
    totalOvertimeHours,
    totalAmount,
    quarterDetails,
    contributingActivities
  };
}

export { computeDashboardStats, computeEmployeeStats };
