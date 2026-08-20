/**
 * activities-render.ts - Activities list view: table state, filtering/sorting, and row rendering.
 * Part 1/5 of the activities module (split from a single 3400-line file for
 * maintainability); see activities-form.js, activities-reservations.js,
 * activities-financials.js, activities-history.js for the rest.
 *
 * Looks like a self-contained view at first glance, but its search/filter inputs are actually
 * wired from the not-yet-converted js/activities-form.js (resetActivitiesPageAndRender), and their
 * values are read directly by js/state.js's saveUiState()/restoreUiState() for persistence. A real
 * React conversion here would need to touch both of those before their own turn in Phase 4, so —
 * like js/datepicker.ts, js/activities-file-links.ts, js/activities-history.ts and
 * js/activities-financials.ts — this stays a plain TS module for now.
 *
 * Also a barrel re-exporting context-menu.ts (the row right-click menu) and bulk-actions.ts (the
 * floating multi-select actions bar) under this original shared import path (the same pattern
 * used by src/services/backup/index.ts and src/activities/reservations/index.ts) — split out
 * because the original file mixed the table itself with those two largely independent UI pieces.
 * Both submodules import activitiesState/renderActivities back from here — a real circular
 * import, safe since nothing runs during either module's top-level evaluation, same as the other
 * circular imports already in this codebase (e.g. utils.ts <-> state.ts).
 */
import { appState, getFiscalYear, getQuarterNumber, parseLocalDateStr, saveUiState } from "../state/state.ts";
import {
  getReservationRoomAbbreviation,
  getActivityReferences,
  getRoomsTariffTotal,
  escapeHtml,
  formatCurrency,
  calculateDaysCount,
  renderPaginationBar,
  getMultiSelectValues
} from "../utils/utils.ts";
import { reconciliationState } from "../services/reconciliation.ts";
import { openActivityDrawer } from "./financials.ts";
import { TECHNICAL_DIRECTOR_SALARY_ID } from "./reservations/subrows.ts";
import { showActivityContextMenu } from "./context-menu.ts";
import { updateBulkActionsBar } from "./bulk-actions.ts";

// Typed shorthand for document.getElementById in this file's DOM-manipulation code — see
// activities-financials.ts's `el` helper doc comment for why this cast is needed/safe.
function el<T extends Element = HTMLInputElement>(id: string): T {
  return document.getElementById(id) as unknown as T;
}

// Activities view UI state, grouped so the module's moving parts live in one place
const activitiesState = {
  sortKey: "id",
  sortOrder: "asc",
  page: 1,
  pageSize: 10,
  // Id of an activity currently open in the drawer that hasn't been saved yet (created via the
  // "Estimation" quick button). Discarded (removed from appState.activities, not just closed) if
  // the drawer is closed/cancelled without clicking "Enregistrer".
  draftActivityId: null as any,
  openedActivitySnapshot: null as any,
  selectedIds: new Set<any>(),
  // Undo/Redo history for the currently-open activity drawer (Ctrl+Z / Ctrl+Y): each entry is a
  // deep snapshot of the activity record taken right after a successful auto-save. Reset whenever
  // the drawer opens/closes so history never leaks between activities.
  undoStack: [] as any[],
  redoStack: [] as any[],
  // {refDate, viewMode} snapshot of the calendar the drawer was opened from (see
  // activities-financials.ts's openActivityDrawer), so the "back to calendar" button can restore
  // it. Not in the initial shape at declaration time in the original .js — TS needs it upfront.
  calendarReturn: null as any
};

const ACTIVITY_UNDO_HISTORY_LIMIT = 50;

// Which flow the "Nom de l'activité" modal is currently serving: "soumission" creates and saves
// the activity immediately in soumission mode; "estimation" only builds it in memory (estimation
// mode) until the user actually saves the drawer form.
const newActivityModalIntent = "soumission";

// Activity lifecycle states, in order
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
      return "badge-warning";
    case "soumise":
      return "badge-warning";
    default:
      return "badge-danger";
  }
}

// {done, total, percent} of an activity's planning tasks
function getPlanningProgress(act: any) {
  const tasks = act.planning_tasks || [];
  const done = tasks.filter((t: any) => t.done).length;
  const total = tasks.length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return { done, total, percent };
}

// Recomputes the lifecycle state from whichever stage markers are still established (submission
// sent, contract approved, planning complete, billed, completed) instead of trusting a stored
// value — so unchecking a later marker falls back to the highest earlier one still standing,
// rather than clearing the state outright.
function deriveActivityState(act: any) {
  const progress = getPlanningProgress(act);
  const established = new Set(["brouillon"]);
  if (act.submission?.sent_at) established.add("soumise");
  if (act.contract?.approved_at) established.add("approuvee");
  if (progress.total > 0 && progress.done === progress.total && (act.submission?.sent_at || act.contract?.approved_at)) {
    established.add("planifiee");
  }
  if (act.billed_at) established.add("facturee");
  if (act.completed_at) established.add("terminee");

  let result = ACTIVITY_STATES[0].value;
  ACTIVITY_STATES.forEach(s => {
    if (established.has(s.value)) result = s.value;
  });
  return result;
}

// Small progress-bar HTML snippet reused in the activities list and the Planification tab
function buildProgressBarHtml(percent: number) {
  return `
    <div class="progress-bar" title="${percent}%">
      <div class="progress-bar-fill ${percent >= 100 ? "complete" : ""}" style="width: ${percent}%;"></div>
    </div>
  `;
}

function renderActivities() {
  saveUiState();
  const tbody = el("activities-table-body");
  const searchQuery = el("activity-search").value.toLowerCase();
  const filterSalles = getMultiSelectValues("filter-salle-panel");
  const filterClientTypes = getMultiSelectValues("filter-client-type-panel");
  const filterStatuses = getMultiSelectValues("filter-status-panel");

  // Enable or disable the reset filters button based on active filters
  const hasActiveFilters =
    searchQuery.trim().length > 0 || filterSalles.length > 0 || filterClientTypes.length > 0 || filterStatuses.length > 0;
  const resetBtn = document.getElementById("reset-filters-btn") as HTMLButtonElement | null;
  if (resetBtn) {
    resetBtn.disabled = !hasActiveFilters;
  }

  tbody.innerHTML = "";

  // Filter activities
  const filtered = appState.activities.filter(act => {
    if (act.deleted) return false;

    // Search filter: ID, Name, Responsable, Reference, or any ventilated Account Code
    const matchesSearch =
      !searchQuery ||
      act.id.toLowerCase().includes(searchQuery) ||
      act.name.toLowerCase().includes(searchQuery) ||
      act.responsable.toLowerCase().includes(searchQuery) ||
      (act.distributions || []).some(
        (d: any) => (d.account_code || "").toLowerCase().includes(searchQuery) || (d.reference || "").toLowerCase().includes(searchQuery)
      );

    // Salle filter
    const matchesSalle = filterSalles.length === 0 || (act.reservations || []).some((r: any) => filterSalles.includes(r.room_name));

    // Client type filter
    const matchesClientType = filterClientTypes.length === 0 || filterClientTypes.includes(act.client_type);

    // Status filter
    const matchesStatus = filterStatuses.length === 0 || filterStatuses.includes(act.state);

    // Period filter
    let matchesPeriod = false;
    if (!act.date_start) {
      matchesPeriod = true;
    } else {
      const fy = getFiscalYear(act.date_start);
      const q = getQuarterNumber(act.date_start);
      matchesPeriod = fy === appState.selected_year && q !== null && appState.selected_quarters.includes(q);
    }

    return matchesSearch && matchesSalle && matchesClientType && matchesStatus && matchesPeriod;
  });

  // Extract sort keys once per activity (O(N)) before sorting
  function extractSortKey(act: any): string | number {
    switch (activitiesState.sortKey) {
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
        return act.distributions.reduce((sum: number, d: any) => sum + d.amount, 0);
      case "sansFrais":
        return act.client_type === "interne" ? getRoomsTariffTotal(act) : 0;
      default:
        return "";
    }
  }

  const mapped = filtered.map(act => ({ act, key: extractSortKey(act) }));
  mapped.sort((a, b) => {
    const valA = a.key;
    const valB = b.key;
    if (typeof valA === "string" && typeof valB === "string") {
      return activitiesState.sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
    } else {
      return activitiesState.sortOrder === "asc" ? Number(valA) - Number(valB) : Number(valB) - Number(valA);
    }
  });
  const sortedFiltered = mapped.map(item => item.act);

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="text-center" style="color: var(--text-muted); padding: 32px;">Aucune activité trouvée. Cliquez sur "+ Nouvelle Activité" pour en créer une.</td></tr>`;
    renderPaginationBar(el("activities-pagination"), {
      page: activitiesState.page,
      pageSize: activitiesState.pageSize,
      totalItems: 0,
      onPageChange: () => {},
      onPageSizeChange: () => {}
    });
    return;
  }

  activitiesState.page = renderPaginationBar(el("activities-pagination"), {
    page: activitiesState.page,
    pageSize: activitiesState.pageSize,
    totalItems: filtered.length,
    onPageChange: p => {
      activitiesState.page = p;
      activitiesState.selectedIds.clear();
      renderActivities();
    },
    onPageSizeChange: s => {
      activitiesState.pageSize = s;
      activitiesState.page = 1;
      activitiesState.selectedIds.clear();
      renderActivities();
    }
  });
  const pageItems = sortedFiltered.slice(
    (activitiesState.page - 1) * activitiesState.pageSize,
    activitiesState.page * activitiesState.pageSize
  );

  let rowsHtml = "";
  pageItems.forEach((act: any) => {
    const isFilled = act.name.trim() !== "";
    const totalRev = act.distributions.reduce((sum: number, d: any) => sum + d.amount, 0);

    // Format dates
    let datesText = "-";
    let daysCount = 0;
    if (act.date_start || act.date_end) {
      if (act.date_start && act.date_end) {
        if (act.date_start === act.date_end) {
          datesText = parseLocalDateStr(act.date_start).toLocaleDateString("fr-CA", { weekday: "short", month: "short", day: "numeric" });
        } else {
          daysCount = calculateDaysCount(act.date_start, act.date_end);
          const start = parseLocalDateStr(act.date_start).toLocaleDateString("fr-CA", { weekday: "short", month: "short", day: "numeric" });
          const end = parseLocalDateStr(act.date_end).toLocaleDateString("fr-CA", { weekday: "short", month: "short", day: "numeric" });
          datesText =
            daysCount > 0
              ? `<div style="display: flex; flex-direction: column; gap: 2px; line-height: 1.2;">
                 <span>${start}</span>
                 <span style="font-size: 0.75rem; color: var(--text-muted);">au ${end}</span>
               </div>`
              : `<div style="display: flex; flex-direction: column; gap: 2px; line-height: 1.2; color: var(--danger);">
                 <span>⚠ ${start}</span>
                 <span style="font-size: 0.75rem;">au ${end}</span>
               </div>`;
        }
      } else if (act.date_start) {
        const start = parseLocalDateStr(act.date_start).toLocaleDateString("fr-CA", { weekday: "short", month: "short", day: "numeric" });
        datesText = `À partir du ${start}`;
      } else if (act.date_end) {
        const end = parseLocalDateStr(act.date_end).toLocaleDateString("fr-CA", { weekday: "short", month: "short", day: "numeric" });
        datesText = `Jusqu'au ${end}`;
      }
    }

    // Bar service active indicator & total hostess count
    const hasBarService = (act.reservations || []).some((r: any) => r.bar_service?.active);
    const hasTechnicalDirector = (act.reservations || []).some((r: any) =>
      (r.staff || []).some((s: any) => s.salary_id === TECHNICAL_DIRECTOR_SALARY_ID && (s.count === undefined || s.count > 0 || !!s.date))
    );
    const totalHostesses = (act.reservations || []).reduce(
      (sum: number, r: any) => sum + (r.bar_service?.hostess_count || 0) + (r.host_duties?.hostess_count || 0),
      0
    );

    // Reconciliation badge if ledger file has been uploaded
    const activityReferences = getActivityReferences(act);
    let statusBadge = "";
    if (reconciliationState.ledgerTransactions.length > 0 && isFilled && activityReferences) {
      // Find reconciliation statuses for this activity
      const related = reconciliationState.results.filter(r => r.activityId === act.id);
      if (related.length > 0) {
        const hasDiff = related.some(r => r.status === "diff");
        const hasUnlogged = related.some(r => r.status === "unlogged");
        const allValid = related.every(r => r.status === "valid");

        if (allValid) {
          statusBadge = `<span class="badge badge-success">Rapproché</span>`;
        } else if (hasDiff) {
          statusBadge = `<span class="badge badge-danger">Écart montant</span>`;
        } else if (hasUnlogged) {
          statusBadge = `<span class="badge badge-warning">Non dans GL</span>`;
        }
      }
    }

    const progress = getPlanningProgress(act);
    const stateCellHtml = isFilled
      ? `
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <span class="badge ${getActivityStateBadgeClass(act.state)}">${getActivityStateLabel(act.state)}</span>
        ${progress.total > 0 ? `${buildProgressBarHtml(progress.percent)}<span style="font-size: 0.7rem; color: var(--text-muted);">${progress.done}/${progress.total} tâches</span>` : ""}
      </div>
    `
      : "-";

    rowsHtml += `
      <tr class="activity-row ${isFilled ? "" : "row-empty"} ${activitiesState.selectedIds.has(act.id) ? "selected" : ""}" data-id="${escapeHtml(act.id)}" style="cursor: pointer; ${isFilled ? "" : "opacity: 0.5; font-style: italic;"}">
        <td onclick="event.stopPropagation();" style="text-align: center; vertical-align: middle; width: 22px; padding-left: 8px; padding-right: 2px;">
          <label style="cursor: pointer;">
            <span class="sr-only">Sélectionner l'activité ${escapeHtml(act.id)}</span>
            <input type="checkbox" id="activity-select-${escapeHtml(act.id)}" class="activity-select-checkbox" data-id="${escapeHtml(act.id)}" ${activitiesState.selectedIds.has(act.id) ? "checked" : ""} style="cursor: pointer;" />
          </label>
        </td>
        <td>${datesText}</td>
        <td class="font-mono">${isFilled && act.coba ? escapeHtml(act.coba) : "-"}</td>
        <td>
          <span class="bold">${isFilled ? escapeHtml(act.name) : "Vierge"}</span> ${statusBadge}
        </td>
        <td>${isFilled ? escapeHtml((act.reservations || []).map(getReservationRoomAbbreviation).join(", ")) : "-"}</td>
        <td>${isFilled ? (hasBarService ? "Oui" : "") : "-"}</td>
        <td>${isFilled ? (totalHostesses > 0 ? totalHostesses : "") : "-"}</td>
        <td>${isFilled ? (hasTechnicalDirector ? "Oui" : "") : "-"}</td>
        <td class="font-mono">${isFilled && activityReferences ? escapeHtml(activityReferences) : "-"}</td>
        <td class="bold">${isFilled ? formatCurrency(totalRev) : "-"}</td>
        <td>${stateCellHtml}</td>
      </tr>
    `;
  });
  tbody.innerHTML = rowsHtml;

  // Attach checkbox change event listeners
  document.querySelectorAll<HTMLInputElement>(".activity-select-checkbox").forEach(cb => {
    cb.addEventListener("change", e => {
      const id = cb.getAttribute("data-id");
      if (cb.checked) {
        activitiesState.selectedIds.add(id);
        cb.closest("tr")!.classList.add("selected");
      } else {
        activitiesState.selectedIds.delete(id);
        cb.closest("tr")!.classList.remove("selected");
      }
      updateBulkActionsBar();
    });
  });

  // Attach row click/right-click listeners: left click opens the activity record (tabbed
  // lifecycle view), right click opens the row's actions context menu.
  document.querySelectorAll<HTMLElement>(".activity-row").forEach(row => {
    row.addEventListener("click", () => {
      openActivityDrawer(row.getAttribute("data-id") || "");
    });
    row.addEventListener("contextmenu", e => {
      e.preventDefault();
      showActivityContextMenu(e as MouseEvent, row.getAttribute("data-id") || "");
    });
  });

  // Update floating bulk actions bar status
  updateBulkActionsBar();
}

export {
  activitiesState,
  ACTIVITY_STATES,
  ACTIVITY_UNDO_HISTORY_LIMIT,
  newActivityModalIntent,
  getActivityStateLabel,
  getActivityStateBadgeClass,
  getPlanningProgress,
  deriveActivityState,
  buildProgressBarHtml,
  renderActivities
};
export { updateBulkActionsBar, initBulkActionsHandlers } from "./bulk-actions.ts";
