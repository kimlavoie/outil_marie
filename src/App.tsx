import React, { useState, useEffect } from "react";
import { Sidebar } from "./components/layout/Sidebar.tsx";
import { Header } from "./components/layout/Header.tsx";
import { HelpCenterModal } from "./components/layout/HelpCenterModal.tsx";
import { DashboardView } from "./components/dashboard-view.tsx";
import { ReconciliationView } from "./components/reconciliation-view.tsx";
import { SettingsView } from "./components/settings/view.tsx";
import { AccountReportView } from "./components/account-report/AccountReportView.tsx";
import { BackupView } from "./components/backup/BackupView.tsx";
import { checkBackupReminder } from "./services/backup/reminder.ts";
import { renderActivities } from "./activities/render.ts";
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

    // If leaving activities view, clear bulk selection
    if (view !== "activities") {
      import("./activities/render.ts").then(m => {
        if (m.activitiesState.selectedIds) {
          m.activitiesState.selectedIds.clear();
        }
      });
    }
  };

  useEffect(() => {
    if (currentView === "activities") {
      import("./activities/activities-view-template.ts").then(m => {
        m.renderActivitiesViewShell();
        import("./navigation.ts").then(nav => nav.populateDropdowns());
        import("./activities/form.ts").then(f => f.initActivitiesViewHandlers());
        renderActivities();
      });
    }
    checkBackupReminder();
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
        openActivityDrawer(savedDrawer.id);
        switchActivityTab(savedDrawer.tab);
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

        {/* Global Backup Reminder Banner */}
        <div
          id="backup-reminder-banner"
          className="alert alert-warning"
          style={{ display: "none", margin: "12px 24px 0", borderRadius: "var(--radius-md)" }}
        >
          <div id="backup-alert-text" style={{ display: "flex", alignItems: "center" }}></div>
        </div>

        <div className="view-container">
          {currentView === "dashboard" && <DashboardView />}
          {currentView === "activities" && <div id="view-activities" className="view-section active"></div>}
          {currentView === "validation" && <ReconciliationView />}
          {currentView === "account-report" && <AccountReportView onSelectView={handleSelectView} />}
          {currentView === "settings" && <SettingsView />}
          {currentView === "backup" && <BackupView />}
        </div>
      </main>

      {/* Global Modals & Notifications */}
      <HelpCenterModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </div>
  );
};
