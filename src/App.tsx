import React, { useEffect } from "react";
import { Sidebar } from "./components/layout/Sidebar.tsx";
import { Header } from "./components/layout/Header.tsx";
import { HelpCenterModal } from "./components/layout/HelpCenterModal.tsx";
import { DashboardView } from "./components/dashboard-view.tsx";
import { ActivitiesView } from "./components/activities/ActivitiesView.tsx";
import { ActivityDrawer } from "./components/activities/ActivityDrawer.tsx";
import { ReconciliationView } from "./components/reconciliation-view.tsx";
import { SettingsView } from "./components/settings/view.tsx";
import { useSettingsCommand } from "./components/settings/mount.ts";
import { CalendarModal, useCalendarCommand, initCalendarModal, initViewCalendarButtons } from "./components/calendar-view.tsx";
import { AccountReportView } from "./components/account-report/AccountReportView.tsx";
import { BackupView } from "./components/backup/BackupView.tsx";
import { GlobalModals } from "./components/modals/GlobalModals.tsx";
import { checkBackupReminder } from "./services/backup/reminder.ts";
import { initAutoBackup } from "./services/backup/auto-backup.ts";
import { initBackupHandlers } from "./services/backup/index.ts";
import { openActivityDrawer, initActivityDetailsModal, initTaxOverrideModal } from "./activities/financials.ts";
import { getSavedDrawerUiState } from "./activities/financials.ts";
import { initFormHandlers, initNewActivityModal } from "./activities/form.ts";
import { initReconciliationHandlers } from "./components/reconciliation-mount.ts";
import { initCustomDatepickers } from "./activities/datepicker.ts";
import { initActivitiesSort } from "./activities/history/index.ts";
import { logError } from "./utils/logger.ts";
import { appState, restoreUiState } from "./state/state.ts";
import { populateDropdowns } from "./navigation.ts";
import { useCurrentView, setCurrentView } from "./state/view-state.ts";

// Fire-and-forget: not needed for the app to be usable, so it doesn't block mounting.
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

export const App: React.FC = () => {
  const currentView = useCurrentView();
  const settingsCommand = useSettingsCommand();
  const calendarCommand = useCalendarCommand();
  const [isHelpOpen, setIsHelpOpen] = React.useState(false);

  const handleSelectView = (view: string) => {
    setCurrentView(view);
  };

  // One-time wiring for the legacy (non-React) modules still driving the activity drawer,
  // reconciliation, backup, calendar and datepicker DOM handlers — moved here from main.tsx so
  // that entry point can stay a plain createRoot().render(). Runs once after this first commit,
  // same order main.tsx used to call them in. Unlike main.tsx's ad-hoc "call right after
  // root.render()" ordering (which happened to work because React's initial commit is normally
  // synchronous, not because it's guaranteed to be), a useEffect here is guaranteed to run after
  // the DOM has actually committed.
  useEffect(() => {
    void requestPersistentStorage();
    initFormHandlers();
    initNewActivityModal();
    initActivityDetailsModal();
    initTaxOverrideModal();
    initReconciliationHandlers();
    initBackupHandlers();
    initCustomDatepickers();
    initCalendarModal();
    initViewCalendarButtons();

    populateDropdowns();
    restoreUiState();
    initActivitiesSort();
  }, []);

  useEffect(() => {
    checkBackupReminder();
    initAutoBackup();
  }, [currentView]);

  useEffect(() => {
    const activityId = new URLSearchParams(window.location.search).get("activity");
    if (activityId && appState.activities.some(a => a.id === activityId && !a.deleted)) {
      handleSelectView("activities");
      openActivityDrawer(activityId);
    } else {
      const savedDrawer = getSavedDrawerUiState();
      if (savedDrawer && appState.activities.some(a => a.id === savedDrawer.id && !a.deleted)) {
        handleSelectView("activities");
        openActivityDrawer(savedDrawer.id, null, savedDrawer.tab);
      }
    }
  }, []);

  return (
    <div className="app-container">
      <Sidebar
        currentView={currentView}
        onSelectView={handleSelectView}
        onOpenHelp={() => setIsHelpOpen(true)}
      />

      <main className="main-content">
        <Header currentView={currentView} onSelectView={handleSelectView} />

        {/* Global Backup Banners */}
        <div
          id="backup-reminder-banner"
          className="backup-alert-banner"
          style={{ display: "none" }}
        >
          <div id="backup-alert-text" className="backup-alert-message"></div>
          <button
            id="backup-banner-action-btn"
            className="btn-warning-outline"
            style={{ whiteSpace: "nowrap" }}
            onClick={() => handleSelectView("backup")}
          >
            Sauvegarder maintenant
          </button>
        </div>

        <div
          id="auto-backup-reminder-banner"
          className="backup-alert-banner"
          style={{ display: "none" }}
        >
          <div className="backup-alert-message">
            <svg viewBox="0 0 24 24" className="alert-icon" style={{ fill: "var(--warning-text)" }}>
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
            <span id="auto-backup-reminder-text"></span>
          </div>
          <button id="auto-backup-reminder-btn" className="btn-warning-outline" style={{ whiteSpace: "nowrap" }}></button>
        </div>

        <div className="view-container">
          {currentView === "dashboard" && <DashboardView />}
          {currentView === "activities" && <ActivitiesView />}
          {currentView === "validation" && <ReconciliationView />}
          {currentView === "account-report" && <AccountReportView onSelectView={handleSelectView} />}
          {currentView === "settings" && <SettingsView command={settingsCommand} />}
          {currentView === "backup" && <BackupView />}
        </div>
      </main>

      {/* Global Modals & Notifications */}
      <HelpCenterModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      <GlobalModals />
      <ActivityDrawer />
      <CalendarModal command={calendarCommand} />
    </div>
  );
};
