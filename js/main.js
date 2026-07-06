/**
 * main.js - App bootstrap. Loaded last: wires up every module's init
 * function once the DOM is ready.
 */

document.addEventListener("DOMContentLoaded", async () => {
  await loadDatabase();
  applyTheme(appState.settings.theme || "dark");
  initPeriodSelector();
  initNavigation();
  initFormHandlers();
  initNewActivityModal();
  initSettingsHandlers();
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
  }
});
