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
import { appState, saveDatabaseOrRollback, EVENT_TYPES } from "./state/state.ts";
import { escapeHtml, getMultiSelectValues, setMultiSelectValues } from "./utils/utils.ts";
import { activitiesState, renderActivities } from "./activities/render.ts";
import { renderSettings } from "./components/settings/mount.ts";
import { renderDashboard, renderDashboardCharts } from "./components/dashboard-mount.ts";
import { renderReconciliation } from "./components/reconciliation-mount.ts";
import { renderAccountReport } from "./services/account-report.ts";
import { exportToExcel, renderBackupView, checkBackupReminder } from "./services/backup/index.ts";
import { initGlobalSearch } from "./navigation/global-search.ts";
import { initQuickAccessDropdown, renderQuickAccessAll } from "./navigation/quick-access.ts";
import { updateActivePeriodDescription } from "./navigation/period-selector.ts";

function applyTheme(theme: string) {
  document.documentElement.setAttribute("data-theme", theme);
  appState.settings.theme = theme;

  const sunIcon = document.getElementById("theme-sun-icon");
  const moonIcon = document.getElementById("theme-moon-icon");
  const btnText = document.getElementById("theme-btn-text");

  if (!sunIcon || !moonIcon || !btnText) return;

  if (theme === "light") {
    sunIcon.style.display = "none";
    moonIcon.style.display = "inline";
    btnText.textContent = "Mode Sombre";
  } else {
    sunIcon.style.display = "inline";
    moonIcon.style.display = "none";
    btnText.textContent = "Mode Clair";
  }
}

function switchToView(view: string) {
  const navItems = document.querySelectorAll(".nav-item");
  const sections = document.querySelectorAll(".view-section");
  const viewTitle = document.getElementById("view-title");
  const targetSection = document.getElementById(`view-${view}`);
  if (!targetSection || !viewTitle) return;

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

  navItems.forEach(i => i.classList.toggle("active", i.getAttribute("data-view") === view));

  sections.forEach(s => s.classList.remove("active"));
  targetSection.classList.add("active");

  const labels: Record<string, string> = {
    dashboard: "Tableau de bord",
    activities: "Journal des Activités",
    validation: "Rapprochement Comptable",
    "account-report": "Grand Livre local",
    settings: "Configuration",
    backup: "Sauvegarde & Exportations"
  };
  viewTitle.textContent = labels[view] || "Application";

  // Remember the last visited view so it can be restored on reload
  localStorage.setItem("outil_marie_last_view", view);

  renderView(view);
}

function initNavigation() {
  const navItems = document.querySelectorAll(".nav-item");

  navItems.forEach(item => {
    item.addEventListener("click", () => {
      switchToView(item.getAttribute("data-view") || "");
    });
  });

  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    const previousTheme = appState.settings.theme;
    const currentTheme = previousTheme === "light" ? "dark" : "light";
    applyTheme(currentTheme);
    saveDatabaseOrRollback(() => applyTheme(previousTheme), "Le changement de thème n'a pas été enregistré. Réessayez.").then(() => {
      // Re-draw charts in case colors need to adjust (Chart.js respects theme context changes if redrawn)
      if (document.getElementById("view-dashboard")?.classList.contains("active")) {
        renderDashboardCharts();
      }
    });
  });

  document.getElementById("quick-export-excel")?.addEventListener("click", () => {
    exportToExcel();
  });

  const filterRepSelect = document.getElementById("filter-report-account");
  if (filterRepSelect) {
    filterRepSelect.addEventListener("change", () => {
      renderAccountReport();
    });
  }

  const helpCenterModal = document.getElementById("help-center-modal");
  const openHelpBtn = document.getElementById("help-center-btn");
  const closeHelpBtn = document.getElementById("help-center-close-btn");
  const closeHelpFooterBtn = document.getElementById("help-center-close-footer-btn");

  const showHelp = () => {
    if (helpCenterModal) {
      helpCenterModal.style.display = "flex";
      setTimeout(() => {
        helpCenterModal.classList.add("active");
      }, 10);
    }
  };

  const hideHelp = () => {
    if (helpCenterModal) {
      helpCenterModal.classList.remove("active");
      setTimeout(() => {
        if (!helpCenterModal.classList.contains("active")) {
          helpCenterModal.style.display = "none";
        }
      }, 300);
    }
  };

  openHelpBtn?.addEventListener("click", showHelp);
  closeHelpBtn?.addEventListener("click", hideHelp);
  closeHelpFooterBtn?.addEventListener("click", hideHelp);

  helpCenterModal?.addEventListener("click", e => {
    if (e.target === helpCenterModal) {
      hideHelp();
    }
  });

  initQuickAccessDropdown();
  initGlobalSearch();
}

function renderView(view: string) {
  if (view === "dashboard") {
    renderDashboard();
  } else if (view === "activities") {
    renderActivities();
  } else if (view === "validation") {
    renderReconciliation();
  } else if (view === "account-report") {
    renderAccountReport();
  } else if (view === "settings") {
    renderSettings();
  } else if (view === "backup") {
    renderBackupView();
  }
  checkBackupReminder();
}

function renderAll() {
  populateDropdowns();
  renderQuickAccessAll();
  updateActivePeriodDescription();

  const activeNav = document.querySelector(".nav-item.active");
  if (activeNav) {
    renderView(activeNav.getAttribute("data-view") || "");
  }
}

function populateDropdowns() {
  const filterSallePanel = document.getElementById("filter-salle-panel") as HTMLElement | null;
  const deptsSelects = [document.getElementById("form-activity-dept") as HTMLSelectElement | null];

  // Multi-select: rebuild the checkbox list, preserving whatever was checked
  if (filterSallePanel) {
    const previousSalleValues = getMultiSelectValues("filter-salle-panel");
    filterSallePanel.innerHTML = appState.settings.rooms
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

export {
  applyTheme,
  switchToView,
  initNavigation,
  renderView,
  renderAll,
  populateDropdowns,
  renderQuickAccessAll
};
export { initPeriodSelector } from "./navigation/period-selector.ts";
