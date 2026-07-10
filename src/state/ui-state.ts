import { getMultiSelectValues, setMultiSelectValues } from "../utils/utils.ts";
import { logError } from "../utils/logger.ts";
import { activitiesState } from "../activities/render.ts";
import { reconciliationState } from "../services/reconciliation.ts";
import { accountReportState } from "../services/account-report.ts";

// Persist search/filter/sort/pagination state per view, so reloading the
// page or coming back later drops the user exactly where they left off.
const UI_STATE_KEY = "outil_marie_ui_state";

export function saveUiState() {
  const uiState = {
    activities: {
      search: (document.getElementById("activity-search") as HTMLInputElement)?.value || "",
      filterSalles: getMultiSelectValues("filter-salle-panel"),
      filterClientTypes: getMultiSelectValues("filter-client-type-panel"),
      filterStatuses: getMultiSelectValues("filter-status-panel"),
      sortKey: activitiesState.sortKey,
      sortOrder: activitiesState.sortOrder,
      page: activitiesState.page,
      pageSize: activitiesState.pageSize
    },
    reconciliation: {
      filter: reconciliationState.filter,
      page: reconciliationState.page,
      pageSize: reconciliationState.pageSize
    },
    accountReport: {
      filterAccount: (document.getElementById("filter-report-account") as HTMLSelectElement)?.value || "",
      sortKey: accountReportState.sortKey,
      sortOrder: accountReportState.sortOrder,
      pageSize: accountReportState.pageSize,
      pages: accountReportState.pages
    }
  };
  localStorage.setItem(UI_STATE_KEY, JSON.stringify(uiState));
}

// Restores the UI state saved above. Must run after the DOM is ready and
// before the views first render, so the restored values are picked up by
// renderActivities/renderReconciliationTable/renderAccountReport on the
// initial render pass.
export function restoreUiState() {
  const raw = localStorage.getItem(UI_STATE_KEY);
  if (!raw) return;

  let uiState: any;
  try {
    uiState = JSON.parse(raw);
  } catch (e) {
    logError("state", "lecture de l'état d'interface sauvegardé, ignoré", e);
    return;
  }

  const act = uiState.activities || {};
  const searchEl = document.getElementById("activity-search") as HTMLInputElement | null;
  if (searchEl && act.search !== undefined) searchEl.value = act.search;
  if (act.filterSalles !== undefined) setMultiSelectValues("filter-salle-panel", act.filterSalles);
  if (act.filterClientTypes !== undefined) setMultiSelectValues("filter-client-type-panel", act.filterClientTypes);
  if (act.filterStatuses !== undefined) setMultiSelectValues("filter-status-panel", act.filterStatuses);
  if (act.sortKey) activitiesState.sortKey = act.sortKey;
  if (act.sortOrder) activitiesState.sortOrder = act.sortOrder;
  if (act.page) activitiesState.page = act.page;
  if (act.pageSize) activitiesState.pageSize = act.pageSize;

  const recon = uiState.reconciliation || {};
  if (recon.filter) {
    reconciliationState.filter = recon.filter;
    document.querySelectorAll(".reconcile-tab").forEach(t => {
      t.classList.toggle("active", t.getAttribute("data-recon-filter") === recon.filter);
    });
  }
  if (recon.page) reconciliationState.page = recon.page;
  if (recon.pageSize) reconciliationState.pageSize = recon.pageSize;

  const report = uiState.accountReport || {};
  const reportAccountEl = document.getElementById("filter-report-account") as HTMLSelectElement | null;
  if (reportAccountEl && report.filterAccount !== undefined) reportAccountEl.value = report.filterAccount;
  if (report.sortKey) accountReportState.sortKey = report.sortKey;
  if (report.sortOrder) accountReportState.sortOrder = report.sortOrder;
  if (report.pageSize) accountReportState.pageSize = report.pageSize;
  if (report.pages) accountReportState.pages = report.pages;
}
