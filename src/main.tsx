import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { logError } from "./utils/logger.ts";
import { showToast } from "./utils/utils.ts";
import { appState, loadDatabase, restoreUiState } from "./state/state.ts";
import { applyTheme, populateDropdowns } from "./navigation.ts";
import { initFormHandlers, initNewActivityModal } from "./activities/form.ts";
import { initReconciliationHandlers } from "./components/reconciliation-mount.ts";
import { initBackupHandlers } from "./services/backup/index.ts";
import { initCustomDatepickers } from "./activities/datepicker.ts";
import { initCalendarModal, initViewCalendarButtons } from "./components/calendar-view.tsx";
import { initActivitiesSort } from "./activities/history/index.ts";
import { initActivityDetailsModal, initTaxOverrideModal } from "./activities/financials.ts";
import { initFilePreviewModal } from "./activities/file-preview/dispatch.ts";
import { renderActivityDrawerShell } from "./activities/drawer-template.ts";
import { renderActivitiesViewShell } from "./activities/activities-view-template.ts";

window.addEventListener("error", e => {
  logError("main", "erreur non gérée", e.error || e.message);
  showToast("Une erreur inattendue est survenue. Voir la console pour les détails.", "error");
});

window.addEventListener("unhandledrejection", e => {
  logError("main", "promesse rejetée non gérée", e.reason);
  showToast("Une erreur inattendue est survenue. Voir la console pour les détails.", "error");
});

async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return;
    const alreadyPersisted = await navigator.storage.persisted?.();
    if (alreadyPersisted) return;
    await navigator.storage.persist();
  } catch (e) {
    logError("main", "demande de stockage persistant", e);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadDatabase();
  void requestPersistentStorage();
  applyTheme(appState.settings.theme || "dark");

  // Mount React App
  const rootElement = document.getElementById("root");
  if (rootElement) {
    const root = createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  }

  // Pre-render shells & init handlers for activity drawer and legacy sub-modals
  renderActivityDrawerShell();
  renderActivitiesViewShell();
  initFormHandlers();
  initNewActivityModal();
  initActivityDetailsModal();
  initTaxOverrideModal();
  initFilePreviewModal();
  initReconciliationHandlers();
  initBackupHandlers();
  initCustomDatepickers();
  initCalendarModal();
  initViewCalendarButtons();

  populateDropdowns();
  restoreUiState();
  initActivitiesSort();
});
