/**
 * navigation.ts - Theme, top-level view switching, and render orchestration (renderAll/renderView/
 * populateDropdowns), plus a barrel re-exporting navigation/global-search.ts,
 * navigation/quick-access.ts and navigation/period-selector.ts under this original shared import
 * path (the same pattern used by src/services/backup/index.ts and
 * src/activities/reservations/index.ts) — split out because the original file mixed the global
 * search box, the quick-access dropdown, and the fiscal year/quarter period selector in one
 * 660+-line module.
 *
 * The three submodules import switchToView/renderAll back from here — a real circular import,
 * safe since nothing runs during either module's top-level evaluation, same as the other
 * circular imports already in this codebase (e.g. utils.ts <-> state.ts).
 */
import { appState, EVENT_TYPES } from "./state/state.ts";
import { escapeHtml, getMultiSelectValues, setMultiSelectValues } from "./utils/utils.ts";
import { activitiesState, renderActivities } from "./activities/render.ts";
import { renderReconciliation } from "./components/reconciliation-mount.ts";
import { renderAccountReport } from "./services/account-report.ts";
import { checkBackupReminder } from "./services/backup/reminder.ts";
import { renderQuickAccessAll } from "./navigation/quick-access.ts";
import { updateActivePeriodDescription } from "./navigation/period-selector.ts";
import { getCurrentView, setCurrentView } from "./state/view-state.ts";

// Only the two lines below still do anything: theme UI itself is owned by Sidebar.tsx
// (components/layout/Sidebar.tsx), which re-renders its icon/label from appState.settings.theme
// via useAppState. This function stays for the two non-React call sites that still need it:
// main.tsx (pre-mount, to avoid a flash of the wrong theme before React ever renders) and
// services/backup/restore.ts (to re-sync the <html data-theme> attribute after a JSON restore).
function applyTheme(theme: string) {
  document.documentElement.setAttribute("data-theme", theme);
  appState.settings.theme = theme;
}

// Called by legacy modules that still trigger navigation imperatively (global-search.ts,
// quick-access.ts, bulk-actions.ts, context-menu.ts, backup/index.ts, backup/restore.ts,
// backup/reminder.ts) instead of going through App.tsx's onSelectView prop. Delegates the actual
// view switch to state/view-state.ts, the same store App.tsx reads via useCurrentView(), so the
// two stay in sync instead of switchToView() silently doing nothing (see view-state.ts's header
// comment for how that used to fail).
function switchToView(view: string) {
  if (view !== "activities" && activitiesState.selectedIds) {
    activitiesState.selectedIds.clear();
    const selectAllCheckbox = document.getElementById("activities-select-all") as HTMLInputElement | null;
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    }
    const bar = document.getElementById("bulk-actions-bar");
    if (bar) {
      bar.classList.remove("visible");
    }
  }

  setCurrentView(view);
  renderView(view);
}

async function renderView(view: string) {
  if (view === "activities") {
    renderActivities();
  } else if (view === "validation") {
    renderReconciliation();
  } else if (view === "account-report") {
    renderAccountReport();
  } else if (view === "backup") {
    const { renderBackupView } = await import("./services/backup/index.ts");
    renderBackupView();
  }
  checkBackupReminder();
}

function renderAll() {
  populateDropdowns();
  renderQuickAccessAll();
  updateActivePeriodDescription();
  renderView(getCurrentView());
}

function populateDropdowns() {
  const filterSallePanel = document.getElementById("filter-salle-panel") as HTMLElement | null;
  const deptsSelects = [document.getElementById("form-activity-dept") as HTMLSelectElement | null];

  // Multi-select: rebuild the checkbox list, preserving whatever was checked
  if (filterSallePanel) {
    const previousSalleValues = getMultiSelectValues("filter-salle-panel");
    const rooms = appState.settings?.rooms || [];
    filterSallePanel.innerHTML = rooms
      .map(r => `<label class="multi-select-option"><input type="checkbox" value="${escapeHtml(r.name)}" /> ${escapeHtml(r.name)}</label>`)
      .join("");
    setMultiSelectValues("filter-salle-panel", previousSalleValues);
  }

  // Note: the salle selector inside each reservation card is a searchable combobox built
  // directly from appState.settings.rooms at card-creation time (see buildRoomSelectItems()
  // and addReservationCard() in activities.js), so it doesn't need populating here.

  const eventTypeSelect = document.getElementById("form-activity-event-type") as HTMLSelectElement | null;
  if (eventTypeSelect && !eventTypeSelect.dataset.populated) {
    eventTypeSelect.innerHTML =
      '<option value="">Sélectionner...</option>' + EVENT_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join("");
    eventTypeSelect.dataset.populated = "true";
  }

  deptsSelects.forEach(select => {
    if (!select) return;
    select.innerHTML = '<option value="">Sélectionner un département...</option>';
    appState.settings.departments.forEach(d => {
      select.innerHTML += `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`;
    });
  });

  const reportAccountSelect = document.getElementById("filter-report-account") as HTMLSelectElement | null;
  if (reportAccountSelect) {
    const previousReportValue = reportAccountSelect.value;
    reportAccountSelect.innerHTML = '<option value="">Tous les comptes</option>';
    appState.settings.accounts.forEach(acc => {
      reportAccountSelect.innerHTML += `<option value="${escapeHtml(acc.code)}">${escapeHtml(acc.code)} (${escapeHtml(acc.description)})</option>`;
    });
    reportAccountSelect.value = previousReportValue;
  }
}

export { applyTheme, switchToView, renderView, renderAll, populateDropdowns, renderQuickAccessAll };
export { initPeriodSelector } from "./navigation/period-selector.ts";
