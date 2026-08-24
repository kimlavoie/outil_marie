import { logError } from "../utils/logger.ts";
import { reconciliationState } from "../services/reconciliation.ts";
import { accountReportState } from "../services/account-report.ts";

// Persist search/filter/sort/pagination state per view, so reloading the
// page or coming back later drops the user exactly where they left off.
//
// The "activities" slice used to be generated/restored here too, from #activity-search's raw DOM
// value, #filter-salle-panel/#filter-client-type-panel/#filter-status-panel (multi-select panel
// ids that no longer exist — ActivitiesView.tsx's real ones are #filter-salle-wrapper etc.), and
// activitiesState.sortKey/sortOrder/page/pageSize (a legacy global nothing in the live app writes
// to anymore — ActivitiesView.tsx keeps its own local useState for all of this). That made
// saveUiState() — called from ~15 places across the app, e.g. every drawer close/autosave/undo —
// silently overwrite the correct, React-owned "activities" localStorage slice with filterSalles:
// [], filterStatuses: [], sortKey: "id", page: 1, etc. on every call: harmless within a session
// (React state, not localStorage, drives what's on screen) but the user's filters/sort/page would
// revert to defaults on the next reload. ActivitiesView.tsx already saves/restores that slice
// itself (see its own localStorage effect and getSavedUiState() call) — self-contained, so this
// module has nothing left to do for "activities".
//
// Reads-merges-writes rather than overwriting the whole key outright, for the same reason:
// ActivitiesView.tsx's own effect writes its "activities" slice under this same key, so blindly
// replacing the stored value here would silently drop it again, just with an extra step.
const UI_STATE_KEY = "outil_marie_ui_state";

let lastSavedUiStateStr = "";

export function saveUiState() {
  let existing: any = {};
  try {
    const raw = localStorage.getItem(UI_STATE_KEY);
    existing = raw ? JSON.parse(raw) : {};
  } catch {
    existing = {};
  }

  const uiState = {
    ...existing,
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
  const str = JSON.stringify(uiState);
  if (str !== lastSavedUiStateStr) {
    lastSavedUiStateStr = str;
    localStorage.setItem(UI_STATE_KEY, str);
  }
}

// Restores the UI state saved above. Must run after the DOM is ready and
// before the views first render, so the restored values are picked up by
// renderReconciliationTable/renderAccountReport on the initial render pass.
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

export function getSavedUiState() {
  try {
    const raw = localStorage.getItem(UI_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
