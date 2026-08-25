import { logError } from "../utils/logger.ts";
import { reconciliationState } from "../services/reconciliation.ts";

// Persist search/filter/sort/pagination state per view, so reloading the
// page or coming back later drops the user exactly where they left off.
//
// The "activities" and "accountReport" slices used to be generated/restored here too, from raw
// DOM reads/writes and activitiesState.sortKey/accountReportState.sortKey (legacy globals nothing
// in the live app writes to anymore — ActivitiesView.tsx/AccountReportView.tsx each keep their own
// local useState for all of this, and now save/restore their own slice under this same key
// directly, via getSavedUiState() and their own localStorage effect). For "activities" this used
// to be an active bug: saveUiState() — called from ~15 places across the app, e.g. every drawer
// close/autosave/undo — would silently overwrite the correct, React-owned slice with stale
// defaults on every call, so the user's filters/sort/page reverted on the next reload. For
// "accountReport" it was inert rather than actively harmful — accountReportState was never read
// back by AccountReportView.tsx at all, so the slice this module wrote was simply never restored
// — but the same fix applies: this module has nothing left to do for either.
//
// Reads-merges-writes rather than overwriting the whole key outright, for the same reason:
// ActivitiesView.tsx/AccountReportView.tsx's own effects write their slice under this same key, so
// blindly replacing the stored value here would silently drop it again, just with an extra step.
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
// renderReconciliationTable on the initial render pass.
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
}

export function getSavedUiState() {
  try {
    const raw = localStorage.getItem(UI_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
