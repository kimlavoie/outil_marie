/**
 * navigation.ts - Theme, top-level view switching, and render orchestration (renderAll/renderView/
 * populateDropdowns).
 *
 * Used to also barrel-import/re-export navigation/global-search.ts, navigation/quick-access.ts and
 * navigation/period-selector.ts, each a legacy DOM-manipulation module fully superseded by a React
 * component sharing the same ids/classes (GlobalSearch.tsx, QuickAccess.tsx, PeriodSelector.tsx —
 * see components/layout/Header.tsx). global-search.ts and period-selector.ts's init*() functions
 * had no live caller left at all; quick-access.ts's renderQuickAccessAll() was still called from
 * three real call sites (activities/context-menu.ts, activities/drawer.ts,
 * components/activities/ActivityDrawer.tsx) — a real DOM-ownership conflict, since it wrote into
 * #quick-access-list-global via innerHTML, the very node QuickAccess.tsx renders (conditionally,
 * only while its dropdown is open) and already keeps in sync reactively via useAppState. All three
 * submodules are deleted; their pure/still-relevant logic (fiscal-year window, search matching,
 * period description, quick-access list building) now lives only in the React components, and the
 * three call sites above no longer call anything here — React already re-renders on its own.
 */
import { appState, EVENT_TYPES } from "./state/state.ts";
import { escapeHtml } from "./utils/utils.ts";
import { activitiesState, renderActivities } from "./activities/render.ts";
import { renderReconciliation } from "./components/reconciliation-mount.ts";
import { renderAccountReport } from "./services/account-report.ts";
import { checkBackupReminder } from "./services/backup/reminder.ts";
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

// Called by legacy modules that still trigger navigation imperatively (bulk-actions.ts,
// context-menu.ts, backup/index.ts, backup/restore.ts, backup/reminder.ts) instead of going
// through App.tsx's onSelectView prop. Delegates the actual view switch to state/view-state.ts,
// the same store App.tsx reads via useCurrentView(), so the two stay in sync instead of
// switchToView() silently doing nothing (see view-state.ts's header comment for how that used to
// fail).
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
  renderView(getCurrentView());
}

function populateDropdowns() {
  const deptsSelects = [document.getElementById("form-activity-dept") as HTMLSelectElement | null];

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
}

export { applyTheme, switchToView, renderView, renderAll, populateDropdowns };
