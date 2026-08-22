import React, { useEffect } from "react";
import { useAppState, saveDatabaseOrRollback } from "../../state/state.ts";
import logoUrl from "../../assets/logo.png";

interface SidebarProps {
  currentView: string;
  onSelectView: (view: string) => void;
  onOpenHelp: () => void;
}

export const NAV_ITEMS = [
  { id: "dashboard", label: "Tableau de bord", shortcut: "Alt + 1", iconPath: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" },
  { id: "activities", label: "Activités", shortcut: "Alt + 2", iconPath: "M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z" },
  { id: "validation", label: "Rapprochement GL", shortcut: "Alt + 3", iconPath: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" },
  { id: "account-report", label: "Grand Livre local", shortcut: "Alt + 4", iconPath: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" },
  { id: "settings", label: "Configuration", shortcut: "Alt + 5", iconPath: "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6-3.6z" },
  { id: "backup", label: "Sauvegarde & Export", shortcut: "Alt + 6", iconPath: "M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z" }
];

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onSelectView, onOpenHelp }) => {
  const theme = useAppState(s => s.settings.theme || "dark");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key >= "1" && e.key <= "6") {
        const index = parseInt(e.key, 10) - 1;
        if (NAV_ITEMS[index]) {
          e.preventDefault();
          onSelectView(NAV_ITEMS[index].id);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSelectView]);

  const handleToggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", newTheme);

    import("../../state/state.ts").then(m => {
      const prevTheme = m.appState.settings.theme;
      m.appState.settings.theme = newTheme;
      saveDatabaseOrRollback(() => {
        m.appState.settings.theme = prevTheme;
        document.documentElement.setAttribute("data-theme", prevTheme);
      }, "Le changement de thème n'a pas été enregistré. Réessayez.");
    });
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <img src={logoUrl} alt="Logo" className="sidebar-logo-img" />
        <span className="sidebar-title">Gestion des services communautaires</span>
      </div>

      <nav className="nav-menu">
        {NAV_ITEMS.map(item => (
          <li
            key={item.id}
            className={`nav-item ${currentView === item.id ? "active" : ""}`}
            data-view={item.id}
            onClick={() => onSelectView(item.id)}
          >
            <button title={`Raccourci : ${item.shortcut}`}>
              <svg viewBox="0 0 24 24">
                <path d={item.iconPath} />
              </svg>
              {item.label}
            </button>
          </li>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button
          id="theme-toggle"
          className="theme-toggle-btn"
          type="button"
          onClick={handleToggleTheme}
          style={{ width: "100%", justifyContent: "flex-start" }}
        >
          {theme === "light" ? (
            <svg id="theme-moon-icon" viewBox="0 0 24 24">
              <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4C12.92 3.04 12.46 3 12 3z" />
            </svg>
          ) : (
            <svg id="theme-sun-icon" viewBox="0 0 24 24">
              <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41s-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41s-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z" />
            </svg>
          )}
          <span id="theme-btn-text" style={{ marginLeft: "8px" }}>
            {theme === "light" ? "Mode Sombre" : "Mode Clair"}
          </span>
        </button>

        <button
          id="help-center-btn"
          className="theme-toggle-btn"
          style={{ width: "100%", justifyContent: "flex-start" }}
          onClick={onOpenHelp}
        >
          <svg viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 16h-2v-2h2v2zm1.07-7.75l-.9.92C12.45 11.9 12 12.5 12 14h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z" />
          </svg>
          <span style={{ marginLeft: "8px" }}>Centre d'aide / Manuel</span>
        </button>
      </div>
    </aside>
  );
};
