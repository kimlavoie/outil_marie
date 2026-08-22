import React, { useState, useMemo, useEffect } from "react";
import { useAppState, appState, saveDatabase } from "../../state/state.ts";
import { getFiscalYear, getQuarterNumber, parseLocalDateStr } from "../../state/date-helpers.ts";
import {
  getActivityReferences,
  getRoomsTariffTotal,
  getReservationRoomAbbreviation,
  formatCurrency,
  calculateDaysCount,
  showToast
} from "../../utils/utils.ts";
import { reconciliationState, reconcileLedger } from "../../services/reconciliation.ts";
import { openActivityDrawer } from "../../activities/financials.ts";
import { openNewActivityModal } from "../../activities/new-activity-modal.ts";
import { openCalendarModal } from "../calendar-view.tsx";
import { showActivityContextMenu, closeActivityContextMenu } from "../../activities/context-menu.ts";
import { TECHNICAL_DIRECTOR_SALARY_ID } from "../../activities/reservations/subrows.ts";
import type { Activity } from "../../types/activity.ts";

import { getSavedUiState } from "../../state/ui-state.ts";

const ACTIVITY_STATES = [
  { value: "brouillon", label: "Brouillon" },
  { value: "soumise", label: "Soumise au client" },
  { value: "approuvee", label: "Approuvée" },
  { value: "planifiee", label: "Planifiée" },
  { value: "facturee", label: "Facturée" },
  { value: "terminee", label: "Terminée" }
];

function getActivityStateLabel(state: string) {
  return (ACTIVITY_STATES.find(s => s.value === state) || ACTIVITY_STATES[0]).label;
}

function getActivityStateBadgeClass(state: string) {
  switch (state) {
    case "terminee":
      return "badge-success";
    case "facturee":
    case "planifiee":
      return "badge-info";
    case "approuvee":
    case "soumise":
      return "badge-warning";
    default:
      return "badge-danger";
  }
}

function getPlanningProgress(act: Activity) {
  const tasks = act.planning_tasks || [];
  const done = tasks.filter((t: any) => t.done).length;
  const total = tasks.length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return { done, total, percent };
}

export const ActivitiesView: React.FC = () => {
  const activities = useAppState(s => s.activities) || [];
  const rooms = useAppState(s => s.settings?.rooms) || [];
  const selectedYear = useAppState(s => s.selected_year);
  const selectedQuarters = useAppState(s => s.selected_quarters);

  const savedState = getSavedUiState()?.activities || {};

  // Filter & Search States
  const [searchQuery, setSearchQuery] = useState<string>(() => savedState.search || "");
  const [selectedSalles, setSelectedSalles] = useState<string[]>(() => savedState.filterSalles || []);
  const [selectedClientTypes, setSelectedClientTypes] = useState<string[]>(() => savedState.filterClientTypes || []);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(() => savedState.filterStatuses || []);

  // Dropdown UI Open States
  const [openDropdown, setOpenDropdown] = useState<"salle" | "client" | "status" | "bulkState" | null>(null);

  // Sorting & Pagination States
  const [sortKey, setSortKey] = useState<string>(() => savedState.sortKey || "id");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(() => savedState.sortOrder || "desc");
  const [page, setPage] = useState<number>(() => savedState.page || 1);
  const [pageSize, setPageSize] = useState<number>(() => savedState.pageSize || 10);

  // Save UI state to localStorage on changes
  useEffect(() => {
    try {
      const raw = localStorage.getItem("outil_marie_ui_state");
      const existing = raw ? JSON.parse(raw) : {};
      const updated = {
        ...existing,
        activities: {
          search: searchQuery,
          filterSalles: selectedSalles,
          filterClientTypes: selectedClientTypes,
          filterStatuses: selectedStatuses,
          sortKey,
          sortOrder,
          page,
          pageSize
        }
      };
      localStorage.setItem("outil_marie_ui_state", JSON.stringify(updated));
    } catch (e) {
      // Ignore
    }
  }, [searchQuery, selectedSalles, selectedClientTypes, selectedStatuses, sortKey, sortOrder, page, pageSize]);

  // Bulk Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Close dropdowns on outside click
  useEffect(() => {
    const handleGlobalClick = () => {
      setOpenDropdown(null);
      closeActivityContextMenu();
    };
    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  }, []);

  const toggleDropdown = (e: React.MouseEvent, dropdown: "salle" | "client" | "status" | "bulkState") => {
    e.stopPropagation();
    setOpenDropdown(prev => (prev === dropdown ? null : dropdown));
  };

  // Active filters check for reset button
  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    selectedSalles.length > 0 ||
    selectedClientTypes.length > 0 ||
    selectedStatuses.length > 0;

  const handleResetFilters = () => {
    setSearchQuery("");
    setSelectedSalles([]);
    setSelectedClientTypes([]);
    setSelectedStatuses([]);
    setPage(1);
  };

  // Filter Activities
  const filteredActivities = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return activities.filter(act => {
      if (act.deleted) return false;

      // Search filter
      const matchesSearch =
        !query ||
        act.id.toLowerCase().includes(query) ||
        act.name.toLowerCase().includes(query) ||
        (act.responsable || "").toLowerCase().includes(query) ||
        (act.distributions || []).some(
          (d: any) =>
            (d.account_code || "").toLowerCase().includes(query) ||
            (d.reference || "").toLowerCase().includes(query)
        );

      // Salle filter
      const matchesSalle =
        selectedSalles.length === 0 ||
        (act.reservations || []).some((r: any) => selectedSalles.includes(r.room_name));

      // Client type filter
      const matchesClientType =
        selectedClientTypes.length === 0 || selectedClientTypes.includes(act.client_type);

      // Status filter
      const matchesStatus =
        selectedStatuses.length === 0 || selectedStatuses.includes(act.state);

      // Period filter
      let matchesPeriod = false;
      if (!act.date_start) {
        const firstSlotDate = (act.reservations || [])
          .flatMap((r: any) => (r.slots || []).map((s: any) => s.date))
          .filter(Boolean)
          .sort()[0];
        if (!firstSlotDate) {
          matchesPeriod = true;
        } else {
          const fy = getFiscalYear(firstSlotDate);
          const q = getQuarterNumber(firstSlotDate);
          matchesPeriod =
            fy === selectedYear &&
            q !== null &&
            (selectedQuarters || []).includes(q);
        }
      } else {
        const fy = getFiscalYear(act.date_start);
        const q = getQuarterNumber(act.date_start);
        matchesPeriod =
          fy === selectedYear &&
          q !== null &&
          (selectedQuarters || []).includes(q);
      }

      return matchesSearch && matchesSalle && matchesClientType && matchesStatus && matchesPeriod;
    });
  }, [activities, searchQuery, selectedSalles, selectedClientTypes, selectedStatuses, selectedYear, selectedQuarters]);

  // Sort Activities
  const sortedActivities = useMemo(() => {
    const extractSortKey = (act: Activity): string | number => {
      switch (sortKey) {
        case "id":
          return act.id;
        case "name":
          return act.name.toLowerCase();
        case "responsable":
          return (act.responsable || "").toLowerCase();
        case "date_start":
          return act.date_start || "";
        case "room_name":
          return (act.reservations || []).map(getReservationRoomAbbreviation).join(", ").toLowerCase();
        case "reference":
          return getActivityReferences(act).toLowerCase();
        case "coba":
          return (act.coba || "").toLowerCase();
        case "bar":
          return (act.reservations || []).some((r: any) => r.bar_service?.active) ? 1 : 0;
        case "hostess":
          return (act.reservations || []).reduce(
            (sum: number, r: any) => sum + (r.bar_service?.hostess_count || 0) + (r.host_duties?.hostess_count || 0),
            0
          );
        case "totalRev":
          return (act.distributions || []).reduce((sum: number, d: any) => sum + d.amount, 0);
        case "sansFrais":
          return act.client_type === "interne" ? getRoomsTariffTotal(act) : 0;
        default:
          return "";
      }
    };

    const mapped = filteredActivities.map(act => ({ act, key: extractSortKey(act) }));
    mapped.sort((a, b) => {
      const valA = a.key;
      const valB = b.key;
      if (typeof valA === "string" && typeof valB === "string") {
        return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else {
        return sortOrder === "asc" ? Number(valA) - Number(valB) : Number(valB) - Number(valA);
      }
    });

    return mapped.map(m => m.act);
  }, [filteredActivities, sortKey, sortOrder]);

  // Pagination calculation
  const totalItems = sortedActivities.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const paginatedActivities = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedActivities.slice(start, start + pageSize);
  }, [sortedActivities, currentPage, pageSize]);

  // Table header sort handler
  const handleHeaderSort = (key: string) => {
    if (sortKey === key) {
      setSortOrder(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  const renderSortIcon = (key: string) => {
    const isActive = sortKey === key;
    return (
      <span className={`sort-icon ${isActive ? "active" : ""}`}>
        {isActive ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
      </span>
    );
  };

  // Multi-select Checkbox Handling
  const handleToggleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const currentIds = paginatedActivities.map(a => a.id);
      setSelectedIds(prev => new Set([...prev, ...currentIds]));
    } else {
      const currentIds = new Set(paginatedActivities.map(a => a.id));
      setSelectedIds(prev => new Set([...prev].filter(id => !currentIds.has(id))));
    }
  };

  const handleToggleSelectRow = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isAllSelectedOnPage =
    paginatedActivities.length > 0 &&
    paginatedActivities.every(a => selectedIds.has(a.id));

  const isSomeSelectedOnPage =
    paginatedActivities.some(a => selectedIds.has(a.id)) && !isAllSelectedOnPage;

  // Bulk Actions
  const handleBulkDelete = async () => {
    const count = selectedIds.size;
    if (count === 0) return;
    if (!window.confirm(`Voulez-vous vraiment supprimer les ${count} activités sélectionnées ?`)) return;

    const ids = new Set(selectedIds);
    const touched: { act: Activity; prevDeleted?: boolean }[] = [];
    const prevFavorites = appState.favorites ? [...appState.favorites] : [];

    ids.forEach(id => {
      const act = appState.activities.find(a => a.id === id);
      if (act) {
        touched.push({ act, prevDeleted: act.deleted });
        act.deleted = true;
      }
    });
    appState.favorites = (appState.favorites || []).filter(f => !ids.has(f));

    const saved = await saveDatabase();
    if (!saved) {
      touched.forEach(({ act, prevDeleted }) => {
        act.deleted = prevDeleted;
      });
      appState.favorites = prevFavorites;
      showToast("La suppression n'a pas été enregistrée. Réessayez.", "error", 8000);
      return;
    }

    setSelectedIds(new Set());
    if (reconciliationState.ledgerTransactions.length > 0) {
      reconcileLedger();
    }
  };

  const handleBulkStateChange = async (newState: string) => {
    const count = selectedIds.size;
    if (count === 0) return;

    const touched: { act: Activity; prevState: string }[] = [];
    selectedIds.forEach(id => {
      const act = appState.activities.find(a => a.id === id);
      if (act) {
        touched.push({ act, prevState: act.state });
        act.state = newState;
      }
    });

    const saved = await saveDatabase();
    setOpenDropdown(null);

    if (!saved) {
      touched.forEach(({ act, prevState }) => {
        act.state = prevState;
      });
      showToast("Le changement d'état n'a pas été enregistré. Réessayez.", "error", 8000);
      return;
    }

    setSelectedIds(new Set());
  };

  // Helper for multi-select dropdown toggles
  const handleToggleMultiSelectOption = (
    list: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>,
    val: string
  ) => {
    setList(prev => (prev.includes(val) ? prev.filter(item => item !== val) : [...prev, val]));
    setPage(1);
  };

  return (
    <div className="table-card">
      {/* Toolbar */}
      <div className="table-toolbar">
        <div className="search-wrapper">
          <svg className="search-icon" viewBox="0 0 24 24">
            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
          </svg>
          <label htmlFor="activity-search" className="sr-only">Rechercher une activité</label>
          <input
            type="text"
            id="activity-search"
            className="search-input"
            placeholder="Rechercher par activité, responsable, facture..."
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="filter-actions">
          {/* Salle Filter Dropdown */}
          <div className="multi-select" id="filter-salle-wrapper">
            <button
              type="button"
              className="select-input multi-select-btn"
              onClick={e => toggleDropdown(e, "salle")}
              aria-haspopup="true"
              aria-expanded={openDropdown === "salle"}
            >
              {selectedSalles.length === 0
                ? "Toutes les salles"
                : `${selectedSalles.length} salle${selectedSalles.length > 1 ? "s" : ""}`}
            </button>
            <div className="multi-select-panel" hidden={openDropdown !== "salle"} onClick={e => e.stopPropagation()}>
              {rooms.map(r => (
                <label key={r.name} className="multi-select-option">
                  <input
                    type="checkbox"
                    checked={selectedSalles.includes(r.name)}
                    onChange={() => handleToggleMultiSelectOption(selectedSalles, setSelectedSalles, r.name)}
                  />
                  {r.name}
                </label>
              ))}
            </div>
          </div>

          {/* Client Type Filter Dropdown */}
          <div className="multi-select" id="filter-client-type-wrapper">
            <button
              type="button"
              className="select-input multi-select-btn"
              onClick={e => toggleDropdown(e, "client")}
              aria-haspopup="true"
              aria-expanded={openDropdown === "client"}
            >
              {selectedClientTypes.length === 0
                ? "Tous types clients"
                : `${selectedClientTypes.length} type${selectedClientTypes.length > 1 ? "s" : ""}`}
            </button>
            <div className="multi-select-panel" hidden={openDropdown !== "client"} onClick={e => e.stopPropagation()}>
              <label className="multi-select-option">
                <input
                  type="checkbox"
                  checked={selectedClientTypes.includes("interne")}
                  onChange={() => handleToggleMultiSelectOption(selectedClientTypes, setSelectedClientTypes, "interne")}
                />
                Interne
              </label>
              <label className="multi-select-option">
                <input
                  type="checkbox"
                  checked={selectedClientTypes.includes("externe")}
                  onChange={() => handleToggleMultiSelectOption(selectedClientTypes, setSelectedClientTypes, "externe")}
                />
                Externe
              </label>
            </div>
          </div>

          {/* Status Filter Dropdown */}
          <div className="multi-select" id="filter-status-wrapper">
            <button
              type="button"
              className="select-input multi-select-btn"
              onClick={e => toggleDropdown(e, "status")}
              aria-haspopup="true"
              aria-expanded={openDropdown === "status"}
            >
              {selectedStatuses.length === 0
                ? "Tous les états"
                : `${selectedStatuses.length} état${selectedStatuses.length > 1 ? "s" : ""}`}
            </button>
            <div className="multi-select-panel" hidden={openDropdown !== "status"} onClick={e => e.stopPropagation()}>
              {ACTIVITY_STATES.map(s => (
                <label key={s.value} className="multi-select-option">
                  <input
                    type="checkbox"
                    checked={selectedStatuses.includes(s.value)}
                    onChange={() => handleToggleMultiSelectOption(selectedStatuses, setSelectedStatuses, s.value)}
                  />
                  {s.label}
                </label>
              ))}
            </div>
          </div>

          {/* Reset Filters */}
          <button
            type="button"
            className="btn btn-secondary btn-reset-filters"
            disabled={!hasActiveFilters}
            onClick={handleResetFilters}
            title="Réinitialiser tous les filtres de recherche et critères de sélection"
          >
            <svg
              viewBox="0 0 24 24"
              className="reset-icon"
              style={{ width: "16px", height: "16px", fill: "currentColor", marginRight: "6px", verticalAlign: "-3px" }}
            >
              <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
            </svg>
            Réinitialiser les filtres
          </button>

          {/* Calendar View Button */}
          <button
            type="button"
            className="btn btn-secondary"
            title="Voir le calendrier des événements"
            onClick={() => openCalendarModal()}
          >
            <svg viewBox="0 0 24 24" style={{ width: "16px", height: "16px", fill: "currentColor", marginRight: "6px", verticalAlign: "-3px" }}>
              <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H5V8h14v13zM7 10h5v5H7z" />
            </svg>
            Calendrier
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="table-responsive">
        <table>
          <thead>
            <tr>
              <th style={{ width: "22px", paddingLeft: "8px", paddingRight: "2px", textAlign: "center", verticalAlign: "middle" }}>
                <label htmlFor="activities-select-all" className="sr-only">Tout sélectionner</label>
                <input
                  type="checkbox"
                  id="activities-select-all"
                  style={{ cursor: "pointer" }}
                  checked={isAllSelectedOnPage}
                  ref={el => {
                    if (el) el.indeterminate = isSomeSelectedOnPage;
                  }}
                  onChange={handleToggleSelectAll}
                />
              </th>
              <th className="sortable-th" onClick={() => handleHeaderSort("date_start")}>
                Date {renderSortIcon("date_start")}
              </th>
              <th className="sortable-th" onClick={() => handleHeaderSort("coba")}>
                COBA COLL. {renderSortIcon("coba")}
              </th>
              <th className="sortable-th" onClick={() => handleHeaderSort("name")}>
                Activité {renderSortIcon("name")}
              </th>
              <th className="sortable-th" onClick={() => handleHeaderSort("room_name")}>
                Salle {renderSortIcon("room_name")}
              </th>
              <th className="sortable-th" onClick={() => handleHeaderSort("bar")}>
                Bar {renderSortIcon("bar")}
              </th>
              <th className="sortable-th" onClick={() => handleHeaderSort("hostess")}>
                Hôtesse {renderSortIcon("hostess")}
              </th>
              <th style={{ width: "90px" }}>Dir. technique</th>
              <th className="sortable-th" onClick={() => handleHeaderSort("reference")}>
                Facture {renderSortIcon("reference")}
              </th>
              <th className="sortable-th" onClick={() => handleHeaderSort("totalRev")}>
                Revenu {renderSortIcon("totalRev")}
              </th>
              <th style={{ width: "160px" }}>État</th>
            </tr>
          </thead>
          <tbody>
            {paginatedActivities.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-center" style={{ color: "var(--text-muted)", padding: "32px" }}>
                  Aucune activité trouvée. Cliquez sur "+ Nouvelle Activité" pour en créer une.
                </td>
              </tr>
            ) : (
              paginatedActivities.map(act => {
                const isFilled = act.name.trim() !== "";
                const totalRev = (act.distributions || []).reduce((sum: number, d: any) => sum + d.amount, 0);

                // Date formatting
                let datesText: React.ReactNode = "-";
                if (act.date_start || act.date_end) {
                  if (act.date_start && act.date_end) {
                    if (act.date_start === act.date_end) {
                      datesText = parseLocalDateStr(act.date_start).toLocaleDateString("fr-CA", {
                        weekday: "short",
                        month: "short",
                        day: "numeric"
                      });
                    } else {
                      const daysCount = calculateDaysCount(act.date_start, act.date_end);
                      const start = parseLocalDateStr(act.date_start).toLocaleDateString("fr-CA", {
                        weekday: "short",
                        month: "short",
                        day: "numeric"
                      });
                      const end = parseLocalDateStr(act.date_end).toLocaleDateString("fr-CA", {
                        weekday: "short",
                        month: "short",
                        day: "numeric"
                      });
                      datesText =
                        daysCount > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px", lineHeight: "1.2" }}>
                            <span>{start}</span>
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>au {end}</span>
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px", lineHeight: "1.2", color: "var(--danger)" }}>
                            <span>⚠ {start}</span>
                            <span style={{ fontSize: "0.75rem" }}>au {end}</span>
                          </div>
                        );
                    }
                  } else if (act.date_start) {
                    const start = parseLocalDateStr(act.date_start).toLocaleDateString("fr-CA", {
                      weekday: "short",
                      month: "short",
                      day: "numeric"
                    });
                    datesText = `À partir du ${start}`;
                  } else if (act.date_end) {
                    const end = parseLocalDateStr(act.date_end).toLocaleDateString("fr-CA", {
                      weekday: "short",
                      month: "short",
                      day: "numeric"
                    });
                    datesText = `Jusqu'au ${end}`;
                  }
                }

                const hasBarService = (act.reservations || []).some((r: any) => r.bar_service?.active);
                const hasTechnicalDirector = (act.reservations || []).some((r: any) =>
                  (r.staff || []).some(
                    (s: any) =>
                      s.salary_id === TECHNICAL_DIRECTOR_SALARY_ID && (s.count === undefined || s.count > 0 || !!s.date)
                  )
                );
                const totalHostesses = (act.reservations || []).reduce(
                  (sum: number, r: any) =>
                    sum + (r.bar_service?.hostess_count || 0) + (r.host_duties?.hostess_count || 0),
                  0
                );

                // Reconciliation badge
                const activityReferences = getActivityReferences(act);
                let statusBadge = null;
                if (reconciliationState.ledgerTransactions.length > 0 && isFilled && activityReferences) {
                  const related = reconciliationState.results.filter(r => r.activityId === act.id);
                  if (related.length > 0) {
                    const hasDiff = related.some(r => r.status === "diff");
                    const hasUnlogged = related.some(r => r.status === "unlogged");
                    const allValid = related.every(r => r.status === "valid");

                    if (allValid) {
                      statusBadge = <span className="badge badge-success">Rapproché</span>;
                    } else if (hasDiff) {
                      statusBadge = <span className="badge badge-danger">Écart montant</span>;
                    } else if (hasUnlogged) {
                      statusBadge = <span className="badge badge-warning">Non dans GL</span>;
                    }
                  }
                }

                const progress = getPlanningProgress(act);
                const isSelected = selectedIds.has(act.id);

                return (
                  <tr
                    key={act.id}
                    className={`activity-row ${isFilled ? "" : "row-empty"} ${isSelected ? "selected" : ""}`}
                    onClick={() => openActivityDrawer(act.id)}
                    onContextMenu={e => {
                      e.preventDefault();
                      showActivityContextMenu(e.nativeEvent, act.id);
                    }}
                    style={{ cursor: "pointer", opacity: isFilled ? 1 : 0.5, fontStyle: isFilled ? "normal" : "italic" }}
                  >
                    <td
                      onClick={e => handleToggleSelectRow(e, act.id)}
                      style={{ textAlign: "center", verticalAlign: "middle", width: "22px", paddingLeft: "8px", paddingRight: "2px" }}
                    >
                      <label style={{ cursor: "pointer" }}>
                        <span className="sr-only">Sélectionner l'activité {act.id}</span>
                        <input
                          type="checkbox"
                          className="activity-select-checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          style={{ cursor: "pointer" }}
                        />
                      </label>
                    </td>
                    <td>{datesText}</td>
                    <td className="font-mono">{isFilled && act.coba ? act.coba : "-"}</td>
                    <td>
                      <span className="bold">{isFilled ? act.name : "Vierge"}</span> {statusBadge}
                    </td>
                    <td>{isFilled ? (act.reservations || []).map(getReservationRoomAbbreviation).join(", ") : "-"}</td>
                    <td>{isFilled ? (hasBarService ? "Oui" : "") : "-"}</td>
                    <td>{isFilled ? (totalHostesses > 0 ? totalHostesses : "") : "-"}</td>
                    <td>{isFilled ? (hasTechnicalDirector ? "Oui" : "") : "-"}</td>
                    <td className="font-mono">{isFilled && activityReferences ? activityReferences : "-"}</td>
                    <td className="bold">{isFilled ? formatCurrency(totalRev) : "-"}</td>
                    <td>
                      {isFilled ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <span className={`badge ${getActivityStateBadgeClass(act.state)}`}>
                            {getActivityStateLabel(act.state)}
                          </span>
                          {progress.total > 0 && (
                            <>
                              <div className="progress-bar" title={`${progress.percent}%`}>
                                <div
                                  className={`progress-bar-fill ${progress.percent >= 100 ? "complete" : ""}`}
                                  style={{ width: `${progress.percent}%` }}
                                />
                              </div>
                              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                                {progress.done}/{progress.total} tâches
                              </span>
                            </>
                          )}
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      {totalItems > 0 && (
        <div className="pagination-bar">
          <div className="pagination-info">
            {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, totalItems)} sur {totalItems}
          </div>
          <div className="pagination-controls">
            <button
              type="button"
              className="btn-icon pagination-prev"
              disabled={currentPage <= 1}
              onClick={() => setPage(prev => Math.max(1, prev - 1))}
              title="Page précédente"
            >
              <svg viewBox="0 0 24 24" style={{ width: "16px", height: "16px", fill: "currentColor" }}>
                <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
              </svg>
            </button>
            <span className="pagination-page-label">
              Page {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              className="btn-icon pagination-next"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
              title="Page suivante"
            >
              <svg viewBox="0 0 24 24" style={{ width: "16px", height: "16px", fill: "currentColor" }}>
                <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z" />
              </svg>
            </button>
            <select
              className="select-input pagination-size-select"
              value={pageSize}
              onChange={e => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              title="Lignes par page"
            >
              <option value={10}>10 / page</option>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
          </div>
        </div>
      )}

      {/* Floating Bulk Actions Bar */}
      <div className={`bulk-actions-bar ${selectedIds.size > 0 ? "visible" : ""}`}>
        <div className="bulk-actions-content">
          <span className="bulk-selected-count">
            {selectedIds.size} activité{selectedIds.size > 1 ? "s" : ""} sélectionnée{selectedIds.size > 1 ? "s" : ""}
          </span>
          <div className="bulk-actions-buttons">
            <button
              type="button"
              className="btn btn-danger btn-compact"
              onClick={handleBulkDelete}
              title="Supprimer les activités sélectionnées"
            >
              <svg
                viewBox="0 0 24 24"
                style={{ width: "16px", height: "16px", fill: "currentColor", marginRight: "6px", verticalAlign: "-3px" }}
              >
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
              </svg>
              Supprimer
            </button>
            <div className="bulk-dropdown-container">
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                onClick={e => toggleDropdown(e, "bulkState")}
                title="Changer l'état des activités sélectionnées"
              >
                Changer le statut...
              </button>
              <div className={`bulk-state-menu ${openDropdown === "bulkState" ? "" : "hidden"}`} onClick={e => e.stopPropagation()}>
                {ACTIVITY_STATES.map(s => (
                  <button
                    key={s.value}
                    type="button"
                    className="bulk-state-item"
                    onClick={() => handleBulkStateChange(s.value)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-compact"
              onClick={() => setSelectedIds(new Set())}
            >
              Annuler
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
