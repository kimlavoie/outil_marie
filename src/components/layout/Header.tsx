import React from "react";
import { GlobalSearch } from "./GlobalSearch.tsx";
import { QuickAccess } from "./QuickAccess.tsx";
import { PeriodSelector } from "./PeriodSelector.tsx";
import { NAV_ITEMS } from "./Sidebar.tsx";

interface HeaderProps {
  currentView: string;
  onSelectView: (view: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentView, onSelectView }) => {
  const currentLabel = React.useMemo(() => {
    const item = NAV_ITEMS.find(n => n.id === currentView);
    return item ? item.label : "Application";
  }, [currentView]);

  return (
    <header className="top-bar">
      {/* Row 1: View Title on Left, Global Search & Quick Access on Right */}
      <div className="top-bar-row">
        <h1 id="view-title" className="top-bar-title" style={{ margin: 0 }}>
          {currentLabel}
        </h1>
        <div className="top-bar-actions" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <GlobalSearch onSelectView={onSelectView} />
          <QuickAccess onSelectView={onSelectView} />
        </div>
      </div>

      {/* Row 2: Period Selector on Left, Quick Action Buttons on Right */}
      <div className="top-bar-row" style={{ marginTop: "4px" }}>
        <PeriodSelector />
        <div className="top-bar-actions" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            className="btn btn-secondary btn-compact"
            id="quick-export-excel"
            title="Exporter au format Excel"
            onClick={() => import("../../services/backup/index.ts").then(m => m.exportToExcel())}
            style={{ padding: "7px 10px" }}
          >
            <svg viewBox="0 0 24 24" style={{ width: "16px", height: "16px", fill: "currentColor" }}>
              <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z" />
            </svg>
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-compact"
            id="add-estimation-btn-quick"
            title="Créer une estimation rapide"
          >
            Estimation
          </button>

          <button
            type="button"
            className="btn btn-primary btn-compact"
            id="add-activity-btn-quick"
            title="Créer une nouvelle activité (Soumission)"
          >
            + Nouvelle Activité
          </button>
        </div>
      </div>
    </header>
  );
};
