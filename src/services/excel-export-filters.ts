/**
 * excel-export-filters.ts - Which activities (and, for the quarter-end report, which 892-xxx
 * accounts) make it into the Excel export, plus the quarter-end report's reconciliation-issue
 * cell references used to highlight mismatches in the generated file.
 */
import { appState, getFiscalYear, getQuarterNumber } from "../state/state.ts";
import { getActivities } from "../state/activities-repository.ts";
import { getAccounts } from "../state/settings-repository.ts";
import { getActivityReferences } from "../utils/utils.ts";
import { getReconciliationIssuesByActivity } from "./reconciliation.ts";
import { getExcelColName, getRevenueLines, QUARTER_END_FROZEN_COLS } from "./excel-export-utils.ts";
import type { ExcelExportOptions } from "./excel-export-options.ts";

export function filterActivitiesForExport(activities: any[], filters: ExcelExportOptions["filters"]): any[] {
  return activities.filter(act => {
    if (act.deleted) return false;
    if (!act.name || act.name.trim() === "") return false;

    // Period / date filtering
    if (filters.periodMode === "active") {
      const actYear = getFiscalYear(act.date_start);
      const actQuarter = getQuarterNumber(act.date_start);
      if (actYear !== appState.selected_year || actQuarter === null || !appState.selected_quarters.includes(actQuarter)) {
        return false;
      }
    } else if (filters.periodMode === "fiscal_year") {
      const actYear = getFiscalYear(act.date_start);
      const actQuarter = getQuarterNumber(act.date_start);
      if (filters.fiscalYear && actYear !== filters.fiscalYear) return false;
      if (filters.quarters && filters.quarters.length > 0) {
        if (actQuarter === null || !filters.quarters.includes(actQuarter)) return false;
      }
    } else if (filters.periodMode === "custom_dates") {
      if (filters.startDate && act.date_start && act.date_start < filters.startDate) return false;
      if (filters.endDate && act.date_start && act.date_start > filters.endDate) return false;
    }

    // States
    if (filters.states && filters.states.length > 0) {
      const actState = act.state || "brouillon";
      if (!filters.states.includes(actState)) return false;
    }

    // Modes (soumission vs estimation)
    if (filters.modes && filters.modes.length > 0) {
      const actMode = act.mode || "soumission";
      if (!filters.modes.includes(actMode)) return false;
    }

    // Client types
    if (filters.clientTypes && filters.clientTypes.length > 0) {
      if (!filters.clientTypes.includes(act.client_type)) return false;
    }

    // Departments
    if (filters.departments && filters.departments.length > 0) {
      if (!filters.departments.includes(act.department)) return false;
    }

    // Rooms
    if (filters.rooms && filters.rooms.length > 0) {
      const actRooms = (act.reservations || []).map((r: any) => r.room_name).filter(Boolean);
      const hasRoomMatch = filters.rooms.some(rName => actRooms.includes(rName));
      if (!hasRoomMatch) return false;
    }

    // Categories / Event types
    if (filters.categories && filters.categories.length > 0) {
      const cat = act.category || act.event_type || "";
      if (!filters.categories.includes(cat)) return false;
    }

    // Responsable
    if (filters.responsable && filters.responsable.trim() !== "") {
      const query = filters.responsable.toLowerCase().trim();
      const respName = (act.responsable || "").toLowerCase();
      if (!respName.includes(query)) return false;
    }

    // Search text (Name, Description, Notes, Invoice References, Manager)
    if (filters.searchText && filters.searchText.trim() !== "") {
      const q = filters.searchText.toLowerCase().trim();
      const refStr = getActivityReferences(act).toLowerCase();
      const mgrName = `${act.activity_manager?.first_name || ""} ${act.activity_manager?.last_name || ""}`.toLowerCase();
      const mgrCompany = (act.activity_manager?.company_name || "").toLowerCase();
      const match =
        (act.name || "").toLowerCase().includes(q) ||
        (act.description || "").toLowerCase().includes(q) ||
        (act.notes || "").toLowerCase().includes(q) ||
        (act.id || "").toLowerCase().includes(q) ||
        refStr.includes(q) ||
        mgrName.includes(q) ||
        mgrCompany.includes(q);
      if (!match) return false;
    }

    // Financial filters
    if (filters.financialFilter === "with_revenue") {
      const totalRev = getRevenueLines(act).reduce((sum: number, d: any) => sum + (Number(d.amount) || 0), 0);
      if (totalRev <= 0) return false;
    } else if (filters.financialFilter === "zero_revenue") {
      const totalRev = getRevenueLines(act).reduce((sum: number, d: any) => sum + (Number(d.amount) || 0), 0);
      if (totalRev > 0) return false;
    } else if (filters.financialFilter === "non_taxable") {
      if (!act.non_taxable) return false;
    }

    return true;
  });
}

// The quarter-end report's final activity list (date-sorted, zero-revenue rows dropped) and its
// 892-xxx account columns (only the ones actually carrying a non-zero amount on one of those
// activities). Exported so runExportToExcel can compute the totals row's position (for the bold
// patch) from the exact same list generateExcelWorkbook builds its rows from, instead of
// re-deriving a count that could drift out of sync with it.
export function getQuarterEndActivities(options: ExcelExportOptions): { activities: any[]; selectedAccounts: string[] } {
  const sortedActivities = filterActivitiesForExport(getActivities(), options.filters).sort((a, b) =>
    (a.date_start || "").localeCompare(b.date_start || "")
  );

  const selectedAccounts = (options.columns.accounts || [])
    .filter(code => getAccounts().some(a => a.code === code))
    .filter(
      code =>
        code.startsWith("892") &&
        sortedActivities.some(act => getRevenueLines(act).some((d: any) => d.account_code === code && (Number(d.amount) || 0) !== 0))
    );

  const activities = sortedActivities.filter(act => {
    const lines = getRevenueLines(act).filter((d: any) => selectedAccounts.length === 0 || selectedAccounts.includes(d.account_code));
    return lines.reduce((sum: number, d: any) => sum + (Number(d.amount) || 0), 0) !== 0;
  });

  return { activities, selectedAccounts };
}

// The quarter-end report's account cells (e.g. "E3") with an unresolved reconciliation issue
// against the last-reconciled ledger (see getReconciliationIssuesByActivity), split by issue so
// each gets its own highlight color in the generated file (see buildQuarterEndBlob): "diff" (the
// entered amount doesn't match the ledger) vs "unlogged" (entered in the app, not found in the
// ledger at all). Both empty when no reconciliation has been run this session, or when nothing's
// off. Takes the exact (activities, selectedAccounts) pair generateExcelWorkbook built its
// rows/columns from, so the cell refs line up with what's actually on the sheet.
export function getQuarterEndReconciliationCellRefs(
  activities: any[],
  selectedAccounts: string[]
): { diffCellRefs: Set<string>; unloggedCellRefs: Set<string> } {
  const issuesByActivity = getReconciliationIssuesByActivity();
  const diffCellRefs = new Set<string>();
  const unloggedCellRefs = new Set<string>();
  activities.forEach((act, rIdx) => {
    const accountIssues = issuesByActivity.get(act.id);
    if (!accountIssues) return;
    selectedAccounts.forEach((code, accIdx) => {
      const issue = accountIssues.get(code);
      if (!issue) return;
      const colLetter = getExcelColName(QUARTER_END_FROZEN_COLS + accIdx + 1);
      const cellRef = `${colLetter}${rIdx + 2}`;
      (issue === "diff" ? diffCellRefs : unloggedCellRefs).add(cellRef);
    });
  });
  return { diffCellRefs, unloggedCellRefs };
}
