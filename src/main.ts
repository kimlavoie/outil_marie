/**
 * main.ts - App bootstrap. Loaded last: wires up every module's init
 * function once the DOM is ready.
 */
import { logError } from "./utils/logger.ts";
import { showToast } from "./utils/utils.ts";
import { appState, loadDatabase, restoreUiState } from "./state/state.ts";
import { applyTheme, initPeriodSelector, initNavigation, populateDropdowns, renderAll, switchToView } from "./navigation.ts";
import { initFormHandlers, initNewActivityModal } from "./activities/form.ts";
import { initReconciliationHandlers } from "./components/reconciliation-mount.ts";
import { initBackupHandlers } from "./services/backup.ts";
import { initCustomDatepickers } from "./activities/datepicker.ts";
import { initCalendarModal, initViewCalendarButtons } from "./components/calendar-view.tsx";
import { initActivitiesSort } from "./activities/history.ts";
import { openActivityDrawer, initActivityDetailsModal, getSavedDrawerUiState } from "./activities/financials.ts";
import { switchActivityTab } from "./activities/form.ts";
import { renderHelpCenter } from "./help-center.ts";
import { renderActivityDrawerShell } from "./activities/drawer-template.ts";
import { renderActivitiesViewShell } from "./activities/activities-view-template.ts";
import { renderBackupViewShell } from "./services/backup-view-template.ts";

// Global safety net: an uncaught exception or rejected promise anywhere in the app would
// otherwise fail silently (no console visible to the user, no indication a feature broke).
// Surface it as a toast so the user knows something went wrong instead of just "nothing happened".
window.addEventListener("error", e => {
  logError("main", "erreur non gérée", e.error || e.message);
  showToast("Une erreur inattendue est survenue. Voir la console pour les détails.", "error");
});

window.addEventListener("unhandledrejection", e => {
  logError("main", "promesse rejetée non gérée", e.reason);
  showToast("Une erreur inattendue est survenue. Voir la console pour les détails.", "error");
});

document.addEventListener("DOMContentLoaded", async () => {

  await loadDatabase();
  applyTheme(appState.settings.theme || "dark");
  renderActivityDrawerShell();
  renderActivitiesViewShell();
  renderBackupViewShell();
  initPeriodSelector();
  initNavigation();
  renderHelpCenter();
  initFormHandlers();
  initNewActivityModal();
  initActivityDetailsModal();
  initReconciliationHandlers();
  initBackupHandlers();
  initCustomDatepickers();
  initCalendarModal();
  initViewCalendarButtons();

  // Populate dropdowns once so restoreUiState() has real <option>s to select
  // from, then restore search/filter/sort/pagination state before the
  // sort-header classes and first render are set up.
  populateDropdowns();
  restoreUiState();
  initActivitiesSort();

  // Render initial views
  renderAll();

  // Restore the view the user was on before leaving/reloading the app
  const lastView = localStorage.getItem("outil_marie_last_view");
  const validViews = ["dashboard", "activities", "validation", "account-report", "settings", "backup"];
  if (lastView && validViews.includes(lastView) && lastView !== "dashboard") {
    switchToView(lastView);
  }

  // Deep link: ?activity=<id> opens that activity's record directly
  // (used by the "ouvrir dans un nouvel onglet" action in the activities list)
  const activityId = new URLSearchParams(window.location.search).get("activity");
  if (activityId && appState.activities.some(a => a.id === activityId && !a.deleted)) {
    switchToView("activities");
    openActivityDrawer(activityId);
  } else {
    // Otherwise, restore whichever activity record (and tab within it) was left open before
    // leaving/reloading the app (see financials.ts's persistDrawerUiState).
    const savedDrawer = getSavedDrawerUiState();
    if (savedDrawer && appState.activities.some(a => a.id === savedDrawer.id && !a.deleted)) {
      switchToView("activities");
      openActivityDrawer(savedDrawer.id);
      switchActivityTab(savedDrawer.tab);
    }
  }
});
