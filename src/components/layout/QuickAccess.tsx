import React, { useState, useEffect, useRef } from "react";
import { useAppState, toggleFavoriteActivity, getRecentlyViewedActivityIds, parseLocalDateStr } from "../../state/state.ts";
import type { Activity } from "../../types/activity.ts";
import { openActivityDrawer } from "../../activities/financials.ts";

const UPCOMING_ACTIVITY_WINDOW_DAYS = 30;
const UPCOMING_ACTIVITY_LIMIT = 5;

interface QuickAccessProps {
  onSelectView: (view: string) => void;
}

export const QuickAccess: React.FC<QuickAccessProps> = ({ onSelectView }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activities = useAppState(s => s.activities);
  const rawFavorites = useAppState(s => s.favorites);
  const favorites = React.useMemo(() => rawFavorites || [], [rawFavorites]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("click", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("click", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const upcomingIds = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + UPCOMING_ACTIVITY_WINDOW_DAYS);

    return activities
      .filter(act => !act.deleted && act.name.trim() !== "" && act.date_start)
      .map(act => ({ id: act.id, date: parseLocalDateStr(act.date_start) }))
      .filter(entry => !isNaN(entry.date.getTime()) && entry.date >= today && entry.date <= windowEnd)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, UPCOMING_ACTIVITY_LIMIT)
      .map(entry => entry.id);
  }, [activities]);

  const recentIds = React.useMemo(() => getRecentlyViewedActivityIds(), []);

  const categories = React.useMemo(() => {
    return [
      { key: "favorite", label: "Épinglées", ids: favorites },
      { key: "recent", label: "Consultées récemment", ids: recentIds },
      { key: "upcoming", label: "À venir bientôt", ids: upcomingIds }
    ];
  }, [favorites, recentIds, upcomingIds]);

  const { sections, totalCount } = React.useMemo(() => {
    const seen = new Set<string>();
    let count = 0;
    const computedSections: { key: string; label: string; items: Activity[] }[] = [];

    categories.forEach(cat => {
      const items = cat.ids
        .map(id => activities.find(a => a.id === id))
        .filter((act): act is Activity => Boolean(act && !act.deleted && !seen.has(act.id)));

      items.forEach(act => seen.add(act.id));
      count += items.length;

      if (items.length > 0) {
        computedSections.push({ key: cat.key, label: cat.label, items });
      }
    });

    return { sections: computedSections, totalCount: count };
  }, [categories, activities]);

  const handleOpenActivity = (id: string) => {
    setIsOpen(false);
    onSelectView("activities");
    openActivityDrawer(id);
  };

  const handleTogglePin = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    toggleFavoriteActivity(id);
  };

  return (
    <div className="quick-access-container" ref={containerRef} style={{ position: "relative" }}>
      <button
        id="quick-access-toggle-btn"
        className="btn btn-secondary"
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{ display: "flex", alignItems: "center", gap: "6px" }}
      >
        <svg viewBox="0 0 24 24" style={{ width: "16px", height: "16px", fill: "currentColor" }}>
          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
        </svg>
        <span>Accès rapide</span>
        {totalCount > 0 && (
          <span
            id="quick-access-count-badge"
            className="badge badge-info"
            style={{ marginLeft: "4px", fontSize: "0.7rem", padding: "2px 6px" }}
          >
            {totalCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          id="quick-access-dropdown-panel"
          className="calendar-popover active"
          style={{ width: "340px", right: 0, left: "auto" }}
        >
          <div id="quick-access-list-global" style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "360px", overflowY: "auto" }}>
            {totalCount === 0 ? (
              <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", padding: "4px" }}>
                Aucune activité épinglée, consultée récemment ou à venir bientôt.
              </div>
            ) : (
              sections.map(sec => (
                <div key={sec.key} className="quick-access-section">
                  <div
                    className="quick-access-section-label"
                    style={{
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.03em",
                      color: "var(--text-muted)",
                      margin: "4px 0 2px"
                    }}
                  >
                    {sec.label}
                  </div>
                  {sec.items.map(act => {
                    const isFav = sec.key === "favorite";
                    const dateSuffix =
                      sec.key === "upcoming" && act.date_start
                        ? ` · ${parseLocalDateStr(act.date_start).toLocaleDateString("fr-CA", { month: "short", day: "numeric" })}`
                        : "";

                    return (
                      <div
                        key={act.id}
                        className="quick-access-item"
                        onClick={() => handleOpenActivity(act.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "8px",
                          padding: "8px 12px",
                          border: "1px solid var(--border-color)",
                          borderRadius: "var(--radius-sm)",
                          backgroundColor: "var(--bg-main)",
                          cursor: "pointer",
                          marginBottom: "4px"
                        }}
                      >
                        <span style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                          <span className="bold" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {act.name || "Vierge"}
                          </span>
                          <span className="font-mono" style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                            {act.id}
                            {act.responsable ? ` · ${act.responsable}` : ""}
                            {dateSuffix}
                          </span>
                        </span>
                        <button
                          type="button"
                          className={isFav ? "btn-icon remove-quick-access-btn" : "btn-icon pin-quick-access-btn"}
                          onClick={e => handleTogglePin(e, act.id)}
                          title={isFav ? "Retirer des accès rapides" : "Épingler dans l'accès rapide"}
                          style={{ flex: "0 0 auto" }}
                        >
                          <svg viewBox="0 0 24 24" style={{ width: "14px", height: "14px", fill: "currentColor" }}>
                            {isFav ? (
                              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                            ) : (
                              <path d="M12 15.39l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.09l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.39zM12 2L9.19 8.62 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24l-7.19-.62L12 2z" />
                            )}
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
