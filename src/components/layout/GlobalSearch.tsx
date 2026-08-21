import React, { useState, useEffect, useRef } from "react";
import { useAppState } from "../../state/state.ts";
import { textSimilarity } from "../../utils/fuzzy-match.ts";
import { openActivityDrawer } from "../../activities/financials.ts";
import { openSettingsPanel, openAccountModal, openDeptModal } from "../../components/settings/mount.ts";

const GLOBAL_SEARCH_MAX_PER_CATEGORY = 5;
const GLOBAL_SEARCH_FUZZY_MIN_SCORE = 0.5;

function globalSearchMatches(text: string, query: string): boolean {
  const value = (text || "").toLowerCase();
  if (value.includes(query)) return true;
  if (query.length < 3) return false;
  return textSimilarity(value, query) >= GLOBAL_SEARCH_FUZZY_MIN_SCORE;
}

interface GlobalSearchProps {
  onSelectView: (view: string) => void;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ onSelectView }) => {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activities = useAppState(s => s.activities);
  const accounts = useAppState(s => s.settings.accounts);
  const departments = useAppState(s => s.settings.departments);

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

  const normalizedQuery = query.trim().toLowerCase();

  const matchingActivities = React.useMemo(() => {
    if (!normalizedQuery) return [];
    return activities
      .filter(act => !act.deleted && act.name.trim() !== "")
      .filter(
        act =>
          globalSearchMatches(act.id, normalizedQuery) ||
          globalSearchMatches(act.name, normalizedQuery) ||
          globalSearchMatches(act.responsable || "", normalizedQuery)
      )
      .slice(0, GLOBAL_SEARCH_MAX_PER_CATEGORY);
  }, [activities, normalizedQuery]);

  const matchingAccounts = React.useMemo(() => {
    if (!normalizedQuery) return [];
    return accounts
      .filter(acc => globalSearchMatches(acc.code, normalizedQuery) || globalSearchMatches(acc.description, normalizedQuery))
      .slice(0, GLOBAL_SEARCH_MAX_PER_CATEGORY);
  }, [accounts, normalizedQuery]);

  const matchingDepartments = React.useMemo(() => {
    if (!normalizedQuery) return [];
    return departments
      .filter(dept => globalSearchMatches(dept, normalizedQuery))
      .slice(0, GLOBAL_SEARCH_MAX_PER_CATEGORY);
  }, [departments, normalizedQuery]);

  const totalResults = matchingActivities.length + matchingAccounts.length + matchingDepartments.length;

  const handleSelectResult = (type: string, id: string) => {
    setIsOpen(false);
    setQuery("");
    if (type === "activity") {
      onSelectView("activities");
      openActivityDrawer(id);
    } else if (type === "account") {
      onSelectView("settings");
      openSettingsPanel("accounts");
      openAccountModal(id);
    } else if (type === "department") {
      onSelectView("settings");
      openSettingsPanel("departments");
      openDeptModal(id);
    }
  };

  return (
    <div className="global-search-container" ref={containerRef} style={{ position: "relative" }}>
      <div className="search-wrapper" style={{ width: "260px" }}>
        <svg className="search-icon" viewBox="0 0 24 24" style={{ width: "16px", height: "16px", fill: "var(--text-muted)" }}>
          <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
        </svg>
        <input
          id="global-search-input"
          type="search"
          className="search-input"
          placeholder="Recherche globale..."
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (query.trim()) setIsOpen(true);
          }}
        />
      </div>

      {isOpen && normalizedQuery && (
        <div
          id="global-search-results"
          className="calendar-popover active"
          style={{ width: "320px", left: 0, right: "auto" }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "360px", overflowY: "auto" }}>
            {totalResults === 0 ? (
              <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", padding: "4px" }}>Aucun résultat.</div>
            ) : (
            <>
              {matchingActivities.length > 0 && (
                <div className="quick-access-section">
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
                    Activités
                  </div>
                  {matchingActivities.map(act => (
                    <div
                      key={act.id}
                      className="quick-access-item global-search-result"
                      onClick={() => handleSelectResult("activity", act.id)}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        padding: "8px 12px",
                        border: "1px solid var(--border-color)",
                        borderRadius: "var(--radius-sm)",
                        backgroundColor: "var(--bg-main)",
                        cursor: "pointer",
                        marginBottom: "4px"
                      }}
                    >
                      <span className="bold" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {act.name}
                      </span>
                      <span className="font-mono" style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                        {act.id}
                        {act.responsable ? ` · ${act.responsable}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {matchingAccounts.length > 0 && (
                <div className="quick-access-section">
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
                    Comptes GL
                  </div>
                  {matchingAccounts.map(acc => (
                    <div
                      key={acc.code}
                      className="quick-access-item global-search-result"
                      onClick={() => handleSelectResult("account", acc.code)}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        padding: "8px 12px",
                        border: "1px solid var(--border-color)",
                        borderRadius: "var(--radius-sm)",
                        backgroundColor: "var(--bg-main)",
                        cursor: "pointer",
                        marginBottom: "4px"
                      }}
                    >
                      <span className="bold" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {acc.code}
                      </span>
                      <span className="font-mono" style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                        {acc.description}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {matchingDepartments.length > 0 && (
                <div className="quick-access-section">
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
                    Départements
                  </div>
                  {matchingDepartments.map(dept => (
                    <div
                      key={dept}
                      className="quick-access-item global-search-result"
                      onClick={() => handleSelectResult("department", dept)}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        padding: "8px 12px",
                        border: "1px solid var(--border-color)",
                        borderRadius: "var(--radius-sm)",
                        backgroundColor: "var(--bg-main)",
                        cursor: "pointer",
                        marginBottom: "4px"
                      }}
                    >
                      <span className="bold" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {dept}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          </div>
        </div>
      )}
    </div>
  );
};
