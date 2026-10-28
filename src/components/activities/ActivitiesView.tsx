import React, { useState, useMemo, useEffect } from "react";
import { useAppState, saveDatabase, getFavorites, setFavorites } from "../../state/state.ts";
import { getActivityById } from "../../state/activities-repository.ts";
import { getFiscalYear, getQuarterNumber } from "../../state/date-helpers.ts";
import { getActivityReferences, getRoomsTariffTotal, getReservationRoomAbbreviation, showToast } from "../../utils/utils.ts";
import { reconciliationState, reconcileLedger } from "../../services/reconciliation.ts";
import { openActivityDrawer } from "../../activities-dom/financials.ts";
import { showActivityContextMenu, closeActivityContextMenu } from "../../activities-dom/context-menu.ts";
import type { Activity } from "../../types/activity.ts";

import { getSavedUiState } from "../../state/ui-state.ts";
import { ACTIVITY_STATES, getTotalHostesses } from "./activity-state-helpers.ts";
import { ActivitiesToolbar } from "./ActivitiesToolbar.tsx";
import { ActivityRow } from "./ActivityRow.tsx";

export const ActivitiesView: React.FC = () => {
  const activities = useAppState(s => s.activities);
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
    } catch {
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

    return (activities || []).filter(act => {
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
        ) ||
        (act.bar_revenue_lines || []).some((b: any) =>
          (b.receipt_number || "").toLowerCase().includes(query)
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
          return getTotalHostesses(act);
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
    const prevFavorites = [...getFavorites()];

    ids.forEach(id => {
      const act = getActivityById(id);
      if (act) {
        touched.push({ act, prevDeleted: act.deleted });
        act.deleted = true;
      }
    });
    setFavorites(getFavorites().filter(f => !ids.has(f)));

    const saved = await saveDatabase();
    if (!saved) {
      touched.forEach(({ act, prevDeleted }) => {
        act.deleted = prevDeleted;
      });
      setFavorites(prevFavorites);
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
      const act = getActivityById(id);
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
      <ActivitiesToolbar
        searchQuery={searchQuery}
        onSearchChange={value => {
          setSearchQuery(value);
          setPage(1);
        }}
        rooms={rooms}
        selectedSalles={selectedSalles}
        selectedClientTypes={selectedClientTypes}
        selectedStatuses={selectedStatuses}
        openDropdown={openDropdown}
        toggleDropdown={toggleDropdown}
        onToggleMultiSelectOption={(list, listName, val) => {
          const setList = listName === "salle" ? setSelectedSalles : listName === "client" ? setSelectedClientTypes : setSelectedStatuses;
          handleToggleMultiSelectOption(list, setList, val);
        }}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={handleResetFilters}
      />

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
              paginatedActivities.map(act => (
                <ActivityRow
                  key={act.id}
                  act={act}
                  isSelected={selectedIds.has(act.id)}
                  onOpen={openActivityDrawer}
                  onContextMenu={(e, id) => showActivityContextMenu(e.nativeEvent, id)}
                  onToggleSelect={handleToggleSelectRow}
                />
              ))
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
