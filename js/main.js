/**
 * main.js - App bootstrap. Loaded last: wires up every module's init
 * function once the DOM is ready.
 */

document.addEventListener("DOMContentLoaded", () => {
  loadDatabase();
  applyTheme(appState.settings.theme || "dark");
  initPeriodSelector();
  initNavigation();
  initFormHandlers();
  initActivityDetailModal();
  initSettingsHandlers();
  initReconciliationHandlers();
  initBackupHandlers();
  initCustomDatepickers();
  initCalendarModal();

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
});
