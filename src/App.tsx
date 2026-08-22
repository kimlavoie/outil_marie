import React, { useState, useEffect } from "react";
import { Sidebar } from "./components/layout/Sidebar.tsx";
import { Header } from "./components/layout/Header.tsx";
import { HelpCenterModal } from "./components/layout/HelpCenterModal.tsx";
import { DashboardView } from "./components/dashboard-view.tsx";
import { ActivitiesView } from "./components/activities/ActivitiesView.tsx";
import { ActivityDrawer } from "./components/activities/ActivityDrawer.tsx";
import { ReconciliationView } from "./components/reconciliation-view.tsx";
import { SettingsView } from "./components/settings/view.tsx";
import { AccountReportView } from "./components/account-report/AccountReportView.tsx";
import { BackupView } from "./components/backup/BackupView.tsx";
import { GlobalModals } from "./components/modals/GlobalModals.tsx";
import { checkBackupReminder } from "./services/backup/reminder.ts";
import { initAutoBackup } from "./services/backup/auto-backup.ts";
import { openActivityDrawer } from "./activities/financials.ts";
import { getSavedDrawerUiState } from "./activities/financials.ts";
import { switchActivityTab } from "./activities/form.ts";
import { appState } from "./state/state.ts";

export const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<string>(() => {
    const saved = localStorage.getItem("outil_marie_last_view");
    const validViews = ["dashboard", "activities", "validation", "account-report", "settings", "backup"];
    return saved && validViews.includes(saved) ? saved : "dashboard";
  });

  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const handleSelectView = (view: string) => {
    setCurrentView(view);
    localStorage.setItem("outil_marie_last_view", view);
  };

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
          <button id="backup-banner-action-btn" className="btn-warning-outline" style={{ whiteSpace: "nowrap" }}>
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
          {currentView === "settings" && <SettingsView />}
          {currentView === "backup" && <BackupView />}
        </div>
      </main>

      {/* Global Modals & Notifications */}
      <HelpCenterModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      <GlobalModals />
      <ActivityDrawer />
    </div>
  );
};
