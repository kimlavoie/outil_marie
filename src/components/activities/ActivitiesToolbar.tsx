import type React from "react";
import { openCalendarModal } from "../calendar-view.tsx";
import { ACTIVITY_STATES } from "./activity-state-helpers.ts";
import type { Room } from "../../state/store.ts";

/**
 * ActivitiesToolbar.tsx - ActivitiesView.tsx's table toolbar: the search box, the three
 * multi-select filter dropdowns (salle/type de client/état), the reset-filters button and the
 * calendar shortcut. Fully controlled by the parent, which owns the filter state and persists it
 * to localStorage.
 */
export function ActivitiesToolbar({
  searchQuery,
  onSearchChange,
  rooms,
  selectedSalles,
  selectedClientTypes,
  selectedStatuses,
  openDropdown,
  toggleDropdown,
  onToggleMultiSelectOption,
  hasActiveFilters,
  onResetFilters
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  rooms: Room[];
  selectedSalles: string[];
  selectedClientTypes: string[];
  selectedStatuses: string[];
  openDropdown: "salle" | "client" | "status" | "bulkState" | null;
  toggleDropdown: (e: React.MouseEvent, dropdown: "salle" | "client" | "status" | "bulkState") => void;
  onToggleMultiSelectOption: (list: string[], listName: "salle" | "client" | "status", val: string) => void;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
}) {
  return (
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
          onChange={e => onSearchChange(e.target.value)}
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
            {selectedSalles.length === 0 ? "Toutes les salles" : `${selectedSalles.length} salle${selectedSalles.length > 1 ? "s" : ""}`}
          </button>
          <div className="multi-select-panel" hidden={openDropdown !== "salle"} onClick={e => e.stopPropagation()}>
            {rooms.map(r => (
              <label key={r.name} className="multi-select-option">
                <input
                  type="checkbox"
                  checked={selectedSalles.includes(r.name)}
                  onChange={() => onToggleMultiSelectOption(selectedSalles, "salle", r.name)}
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
            {selectedClientTypes.length === 0 ? "Tous types clients" : `${selectedClientTypes.length} type${selectedClientTypes.length > 1 ? "s" : ""}`}
          </button>
          <div className="multi-select-panel" hidden={openDropdown !== "client"} onClick={e => e.stopPropagation()}>
            <label className="multi-select-option">
              <input
                type="checkbox"
                checked={selectedClientTypes.includes("interne")}
                onChange={() => onToggleMultiSelectOption(selectedClientTypes, "client", "interne")}
              />
              Interne
            </label>
            <label className="multi-select-option">
              <input
                type="checkbox"
                checked={selectedClientTypes.includes("externe")}
                onChange={() => onToggleMultiSelectOption(selectedClientTypes, "client", "externe")}
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
            {selectedStatuses.length === 0 ? "Tous les états" : `${selectedStatuses.length} état${selectedStatuses.length > 1 ? "s" : ""}`}
          </button>
          <div className="multi-select-panel" hidden={openDropdown !== "status"} onClick={e => e.stopPropagation()}>
            {ACTIVITY_STATES.map(s => (
              <label key={s.value} className="multi-select-option">
                <input
                  type="checkbox"
                  checked={selectedStatuses.includes(s.value)}
                  onChange={() => onToggleMultiSelectOption(selectedStatuses, "status", s.value)}
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
          onClick={onResetFilters}
          title="Réinitialiser tous les filtres de recherche et critères de sélection"
        >
          <svg viewBox="0 0 24 24" className="reset-icon" style={{ width: "16px", height: "16px", fill: "currentColor", marginRight: "6px", verticalAlign: "-3px" }}>
            <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
          </svg>
          Réinitialiser les filtres
        </button>

        {/* Calendar View Button */}
        <button type="button" className="btn btn-secondary" title="Voir le calendrier des événements" onClick={() => openCalendarModal()}>
          <svg viewBox="0 0 24 24" style={{ width: "16px", height: "16px", fill: "currentColor", marginRight: "6px", verticalAlign: "-3px" }}>
            <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H5V8h14v13zM7 10h5v5H7z" />
          </svg>
          Calendrier
        </button>
      </div>
    </div>
  );
}
