/**
 * navigation.ts - Theme, top-level view switching, shared dropdowns, and the
 * fiscal year / quarter period selector.
 */
import {
  appState,
  saveDatabase,
  getFiscalYear,
  parseLocalDateStr,
  EVENT_TYPES,
  toggleFavoriteActivity,
  getRecentlyViewedActivityIds
} from "./state/state.ts";
import { escapeHtml, debounce, getMultiSelectValues, setMultiSelectValues } from "./utils/utils.ts";
import { textSimilarity } from "./utils/fuzzy-match.ts";
import { activitiesState, renderActivities } from "./activities/render.ts";
import { openActivityDrawer } from "./activities/financials.ts";
import { renderSettings, openSettingsPanel, openAccountModal, openDeptModal } from "./components/settings/view.tsx";
import { renderDashboard, renderDashboardCharts } from "./components/dashboard-view.tsx";
import { renderReconciliation } from "./components/reconciliation-view.tsx";
import { reconciliationState, reconcileLedger } from "./services/reconciliation.ts";
import { renderAccountReport } from "./services/account-report.ts";
import { exportToExcel, renderBackupView, checkBackupReminder } from "./services/backup.ts";

// Theme management
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

// Navigation switcher
function switchToView(view: string) {
  const navItems = document.querySelectorAll(".nav-item");
  const sections = document.querySelectorAll(".view-section");
  const viewTitle = document.getElementById("view-title");
  const targetSection = document.getElementById(`view-${view}`);
  if (!targetSection || !viewTitle) return;

  // Clear activity selections if we leave the activities view
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

  // Update active nav item
  navItems.forEach(i => i.classList.toggle("active", i.getAttribute("data-view") === view));

  // Switch active section
  sections.forEach(s => s.classList.remove("active"));
  targetSection.classList.add("active");

  // Set top bar title
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

  // Render the entered view
  renderView(view);
}

function initNavigation() {
  const navItems = document.querySelectorAll(".nav-item");

  navItems.forEach(item => {
    item.addEventListener("click", () => {
      switchToView(item.getAttribute("data-view") || "");
    });
  });

  // Theme toggle button
  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    const currentTheme = appState.settings.theme === "light" ? "dark" : "light";
    applyTheme(currentTheme);
    saveDatabase();
    // Re-draw charts in case colors need to adjust (Chart.js respects theme context changes if redrawn)
    if (document.getElementById("view-dashboard")?.classList.contains("active")) {
      renderDashboardCharts();
    }
  });

  // Quick Export Excel Header button
  document.getElementById("quick-export-excel")?.addEventListener("click", () => {
    exportToExcel();
  });

  // Account report dropdown filter listener
  const filterRepSelect = document.getElementById("filter-report-account");
  if (filterRepSelect) {
    filterRepSelect.addEventListener("change", () => {
      renderAccountReport();
    });
  }

  // Help center modal triggers
  const helpCenterModal = document.getElementById("help-center-modal");
  const openHelpBtn = document.getElementById("help-center-btn");
  const closeHelpBtn = document.getElementById("help-center-close-btn");
  const closeHelpFooterBtn = document.getElementById("help-center-close-footer-btn");

  const showHelp = () => {
    if (helpCenterModal) {
      helpCenterModal.style.display = "flex";
      // Allow DOM update before adding transition class
      setTimeout(() => {
        helpCenterModal.classList.add("active");
      }, 10);
    }
  };

  const hideHelp = () => {
    if (helpCenterModal) {
      helpCenterModal.classList.remove("active");
      // Wait for CSS transition (300ms) before hiding display
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

  // Close when clicking outside modal content
  helpCenterModal?.addEventListener("click", e => {
    if (e.target === helpCenterModal) {
      hideHelp();
    }
  });

  initQuickAccessDropdown();
  initGlobalSearch();
}

/* ==========================================================================
   GLOBAL SEARCH — searches activities, GL accounts, and departments at once
   ========================================================================== */

const GLOBAL_SEARCH_MAX_PER_CATEGORY = 5;
const GLOBAL_SEARCH_FUZZY_MIN_SCORE = 0.5;

// True if `query` is a substring of `text`, or fuzzy-similar enough to it (typo/word-order
// tolerant) using the same Dice-coefficient scoring as the reconciliation engine's suggestions.
function globalSearchMatches(text: string, query: string): boolean {
  const value = (text || "").toLowerCase();
  if (value.includes(query)) return true;
  return textSimilarity(value, query) >= GLOBAL_SEARCH_FUZZY_MIN_SCORE;
}

function initGlobalSearch() {
  const input = document.getElementById("global-search-input") as HTMLInputElement | null;
  const resultsPanel = document.getElementById("global-search-results");
  if (!input || !resultsPanel) return;

  input.addEventListener(
    "input",
    debounce(() => renderGlobalSearchResults(input.value.trim().toLowerCase()), 200)
  );

  input.addEventListener("focus", () => {
    if (input.value.trim()) resultsPanel.classList.add("active");
  });

  // Close on outside click, keep open on clicks inside the panel itself
  document.addEventListener("click", e => {
    if (resultsPanel.classList.contains("active") && !resultsPanel.contains(e.target as Node) && e.target !== input) {
      resultsPanel.classList.remove("active");
    }
  });

  // Close on Escape, alongside the app's other drawers/modals
  window.addEventListener("keydown", e => {
    if (e.key === "Escape") resultsPanel.classList.remove("active");
  });
}

// Builds one labeled results section (skipped entirely if empty, so an empty category leaves
// no dangling header behind).
function buildGlobalSearchSectionHtml(label: string, itemsHtml: string): string {
  if (!itemsHtml) return "";
  return `
    <div class="quick-access-section">
      <div class="quick-access-section-label" style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-muted); margin: 4px 0 2px;">${label}</div>
      ${itemsHtml}
    </div>
  `;
}

function buildGlobalSearchItemHtml({ type, id, title, subtitle }: { type: string; id: string; title: string; subtitle?: string }): string {
  return `
    <div class="quick-access-item global-search-result" data-type="${type}" data-id="${escapeHtml(id)}" style="display: flex; flex-direction: column; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background-color: var(--bg-main); cursor: pointer; margin-bottom: 4px;">
      <span class="bold" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(title)}</span>
      ${subtitle ? `<span class="font-mono" style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(subtitle)}</span>` : ""}
    </div>
  `;
}

// Opens the result the user clicked: jumps to the right view (and, for settings entities, the
// right tab panel) then opens the matching edit modal/drawer directly.
function openGlobalSearchResult(type: string, id: string) {
  if (type === "activity") {
    switchToView("activities");
    openActivityDrawer(id);
  } else if (type === "account") {
    switchToView("settings");
    openSettingsPanel("accounts");
    openAccountModal(id);
  } else if (type === "department") {
    switchToView("settings");
    openSettingsPanel("departments");
    openDeptModal(id);
  }
}

function renderGlobalSearchResults(query: string) {
  const resultsPanel = document.getElementById("global-search-results");
  if (!resultsPanel) return;

  if (!query) {
    resultsPanel.classList.remove("active");
    resultsPanel.innerHTML = "";
    return;
  }

  const matchingActivities = appState.activities
    .filter(act => !act.deleted && act.name.trim() !== "")
    .filter(
      act => globalSearchMatches(act.id, query) || globalSearchMatches(act.name, query) || globalSearchMatches(act.responsable, query)
    )
    .slice(0, GLOBAL_SEARCH_MAX_PER_CATEGORY);

  const matchingAccounts = appState.settings.accounts
    .filter(acc => globalSearchMatches(acc.code, query) || globalSearchMatches(acc.description, query))
    .slice(0, GLOBAL_SEARCH_MAX_PER_CATEGORY);

  const matchingDepartments = appState.settings.departments
    .filter(dept => globalSearchMatches(dept, query))
    .slice(0, GLOBAL_SEARCH_MAX_PER_CATEGORY);

  const totalCount = matchingActivities.length + matchingAccounts.length + matchingDepartments.length;

  if (totalCount === 0) {
    resultsPanel.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem; padding: 4px;">Aucun résultat.</div>`;
    resultsPanel.classList.add("active");
    return;
  }

  const activitiesHtml = matchingActivities
    .map(act =>
      buildGlobalSearchItemHtml({
        type: "activity",
        id: act.id,
        title: act.name,
        subtitle: `${act.id}${act.responsable ? ` · ${act.responsable}` : ""}`
      })
    )
    .join("");

  const accountsHtml = matchingAccounts
    .map(acc => buildGlobalSearchItemHtml({ type: "account", id: acc.code, title: acc.code, subtitle: acc.description }))
    .join("");

  const departmentsHtml = matchingDepartments
    .map(dept => buildGlobalSearchItemHtml({ type: "department", id: dept, title: dept }))
    .join("");

  resultsPanel.innerHTML =
    buildGlobalSearchSectionHtml("Activités", activitiesHtml) +
    buildGlobalSearchSectionHtml("Comptes GL", accountsHtml) +
    buildGlobalSearchSectionHtml("Départements", departmentsHtml);

  resultsPanel.classList.add("active");

  resultsPanel.querySelectorAll(".global-search-result").forEach(item => {
    item.addEventListener("click", () => {
      const type = item.getAttribute("data-type") || "";
      const id = item.getAttribute("data-id") || "";
      resultsPanel.classList.remove("active");
      const input = document.getElementById("global-search-input") as HTMLInputElement | null;
      if (input) input.value = "";
      openGlobalSearchResult(type, id);
    });
  });
}

/* ==========================================================================
   QUICK ACCESS (ACCÈS RAPIDE) — global dropdown, available from every view
   ========================================================================== */

function initQuickAccessDropdown() {
  const toggleBtn = document.getElementById("quick-access-toggle-btn");
  const panel = document.getElementById("quick-access-dropdown-panel");
  if (!toggleBtn || !panel) return;

  toggleBtn.addEventListener("click", e => {
    e.stopPropagation();
    panel.classList.toggle("active");
  });

  // Close on outside click, keep open on clicks inside the panel itself
  document.addEventListener("click", e => {
    if (panel.classList.contains("active") && !panel.contains(e.target as Node) && e.target !== toggleBtn) {
      panel.classList.remove("active");
    }
  });

  // Close on Escape, alongside the app's other drawers/modals
  window.addEventListener("keydown", e => {
    if (e.key === "Escape") panel.classList.remove("active");
  });
}

function closeQuickAccessDropdown() {
  const panel = document.getElementById("quick-access-dropdown-panel");
  if (panel) panel.classList.remove("active");
}

// Upcoming activities (soon) window/limit for the "À venir bientôt" quick access category
const UPCOMING_ACTIVITY_WINDOW_DAYS = 30;
const UPCOMING_ACTIVITY_LIMIT = 5;

// Ids of filled activities starting today or within the next UPCOMING_ACTIVITY_WINDOW_DAYS days,
// soonest first.
function getUpcomingActivityIds(): string[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + UPCOMING_ACTIVITY_WINDOW_DAYS);

  return appState.activities
    .filter(act => !act.deleted && act.name.trim() !== "" && act.date_start)
    .map(act => ({ id: act.id, date: parseLocalDateStr(act.date_start) }))
    .filter(entry => !isNaN(entry.date.getTime()) && entry.date >= today && entry.date <= windowEnd)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, UPCOMING_ACTIVITY_LIMIT)
    .map(entry => entry.id);
}

// Builds one activity row. `category` controls the action button: pinned entries ("favorite")
// get an unpin (x) button, entries surfaced automatically ("recent"/"upcoming") get a pin
// (star) button so the user can promote them to the permanent list in one click.
function buildQuickAccessItemHtml(act: any, category: string): string {
  const actionBtnHtml =
    category === "favorite"
      ? `<button class="btn-icon remove-quick-access-btn" data-id="${act.id}" title="Retirer des accès rapides" style="flex: 0 0 auto;">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: currentColor;"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </button>`
      : `<button class="btn-icon pin-quick-access-btn" data-id="${act.id}" title="Épingler dans l'accès rapide" style="flex: 0 0 auto;">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: currentColor;"><path d="M12 15.39l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.09l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.39zM12 2L9.19 8.62 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24l-7.19-.62L12 2z"/></svg>
      </button>`;

  const dateSuffix =
    category === "upcoming" && act.date_start
      ? ` · ${parseLocalDateStr(act.date_start).toLocaleDateString("fr-CA", { month: "short", day: "numeric" })}`
      : "";

  return `
    <div class="quick-access-item" data-id="${act.id}" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background-color: var(--bg-main); cursor: pointer;">
      <span style="display: flex; flex-direction: column; overflow: hidden;">
        <span class="bold" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(act.name) || "Vierge"}</span>
        <span class="font-mono" style="font-size: 0.72rem; color: var(--text-muted);">${act.id}${act.responsable ? ` · ${escapeHtml(act.responsable)}` : ""}${dateSuffix}</span>
      </span>
      ${actionBtnHtml}
    </div>
  `;
}

// Builds one labeled section (skipped entirely if empty, so an empty category leaves no
// dangling header behind).
function buildQuickAccessSectionHtml(label: string, items: any[], category: string): string {
  if (items.length === 0) return "";
  return `
    <div class="quick-access-section">
      <div class="quick-access-section-label" style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-muted); margin: 4px 0 2px;">${label}</div>
      ${items.map(act => buildQuickAccessItemHtml(act, category)).join("")}
    </div>
  `;
}

// Wires click-to-open, unpin, and pin buttons for a rendered quick access container
function wireQuickAccessItemEvents(container: HTMLElement) {
  container.querySelectorAll(".quick-access-item").forEach(item => {
    item.addEventListener("click", e => {
      const target = e.target as HTMLElement;
      if (target.closest(".remove-quick-access-btn") || target.closest(".pin-quick-access-btn")) return;
      const id = item.getAttribute("data-id") || "";
      closeQuickAccessDropdown();
      switchToView("activities");
      openActivityDrawer(id);
    });
  });

  container.querySelectorAll(".remove-quick-access-btn, .pin-quick-access-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id") || "";
      toggleFavoriteActivity(id);
      renderQuickAccessAll();
      if (document.getElementById("view-activities")?.classList.contains("active")) renderActivities();
    });
  });
}

// Refreshes the global quick access dropdown (list + count badge). Merges three categories —
// user-pinned favorites, recently viewed, and activities starting soon — de-duplicating so an
// activity that qualifies for more than one only appears once, under the highest-priority
// category (favorites > recent > upcoming). Called after every favorite/view change, and on
// every renderAll(), so it stays correct regardless of which view is active.
function renderQuickAccessAll() {
  const listContainer = document.getElementById("quick-access-list-global");
  const countBadge = document.getElementById("quick-access-count-badge");
  if (!listContainer) return;

  const categories = [
    { key: "favorite", label: "Épinglées", ids: appState.favorites || [] },
    { key: "recent", label: "Consultées récemment", ids: getRecentlyViewedActivityIds() },
    { key: "upcoming", label: "À venir bientôt", ids: getUpcomingActivityIds() }
  ];

  const seen = new Set();
  let totalCount = 0;
  const sectionsHtml = categories
    .map(cat => {
      const items = cat.ids.map(id => appState.activities.find(a => a.id === id)).filter(act => act && !act.deleted && !seen.has(act.id));
      items.forEach(act => seen.add(act.id));
      totalCount += items.length;
      return buildQuickAccessSectionHtml(cat.label, items, cat.key);
    })
    .join("");

  listContainer.innerHTML =
    totalCount > 0
      ? sectionsHtml
      : `<div style="color: var(--text-muted); font-size: 0.85rem; padding: 4px;">Aucune activité épinglée, consultée récemment ou à venir bientôt.</div>`;
  wireQuickAccessItemEvents(listContainer);

  if (countBadge) {
    countBadge.textContent = String(totalCount);
    countBadge.style.display = totalCount > 0 ? "inline-flex" : "none";
  }
}

// Render dynamic elements for a specific view
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
  // Populates dropdown selects in modals and forms
  populateDropdowns();

  // Refreshes the global quick access dropdown (visible from every view)
  renderQuickAccessAll();

  // Update active period description label
  updateActivePeriodDescription();

  // Render currently active view
  const activeNav = document.querySelector(".nav-item.active");
  if (activeNav) {
    renderView(activeNav.getAttribute("data-view") || "");
  }
}

// Populate dropdown elements globally
function populateDropdowns() {
  const filterSallePanel = document.getElementById("filter-salle-panel") as HTMLElement | null;
  const deptsSelects = [document.getElementById("form-activity-dept") as HTMLSelectElement | null];

  // Filter Salle dropdown (multi-select: rebuild the checkbox list, preserving whatever was checked)
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

  // Form Event type dropdown
  const eventTypeSelect = document.getElementById("form-activity-event-type") as HTMLSelectElement | null;
  if (eventTypeSelect && !eventTypeSelect.dataset.populated) {
    eventTypeSelect.innerHTML =
      '<option value="">Sélectionner...</option>' + EVENT_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join("");
    eventTypeSelect.dataset.populated = "true";
  }

  // Departments dropdowns
  deptsSelects.forEach(select => {
    if (!select) return;
    select.innerHTML = '<option value="">Sélectionner un département...</option>';
    appState.settings.departments.forEach(d => {
      select.innerHTML += `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`;
    });
  });

  // Account report dropdown filter
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

/* ==========================================================================
   PERIOD SELECTOR (fiscal year + quarters)
   ========================================================================== */

function updateActivePeriodDescription() {
  const descEl = document.getElementById("active-period-description");
  if (!descEl) return;

  const fy = appState.selected_year;
  const qs = appState.selected_quarters;

  if (!fy) {
    descEl.innerHTML = "Aucune année financière sélectionnée.";
    return;
  }

  if (qs.length === 0) {
    descEl.innerHTML = `⚠️ <span style="color: var(--danger-text, #f43f5e);">Aucun trimestre sélectionné</span>`;
    return;
  }

  const match = /^(\d{4})-(\d{4})$/.exec(fy);
  if (!match) {
    descEl.innerHTML = `Période : ${fy}`;
    return;
  }

  const y1 = match[1];
  const y2 = match[2];

  const sortedQs = [...qs].sort((a, b) => a - b);

  const isContiguous = (() => {
    for (let i = 0; i < sortedQs.length - 1; i++) {
      if (sortedQs[i + 1] !== sortedQs[i] + 1) return false;
    }
    return true;
  })();

  let dateRangeStr = "";
  if (sortedQs.length === 4) {
    dateRangeStr = `du <strong>1er juillet ${y1}</strong> au <strong>30 juin ${y2}</strong>`;
  } else if (isContiguous) {
    const startQ = sortedQs[0];
    const endQ = sortedQs[sortedQs.length - 1];

    let startStr = "";
    if (startQ === 1) startStr = `1er juillet ${y1}`;
    else if (startQ === 2) startStr = `1er octobre ${y1}`;
    else if (startQ === 3) startStr = `1er janvier ${y2}`;
    else startStr = `1er avril ${y2}`;

    let endStr = "";
    if (endQ === 1) endStr = `30 septembre ${y1}`;
    else if (endQ === 2) endStr = `31 décembre ${y1}`;
    else if (endQ === 3) endStr = `31 mars ${y2}`;
    else endStr = `30 juin ${y2}`;

    dateRangeStr = `du <strong>${startStr}</strong> au <strong>${endStr}</strong>`;
  } else {
    const qDetails = sortedQs.map(q => {
      if (q === 1) return `T1 (Juil-Sept ${y1})`;
      if (q === 2) return `T2 (Oct-Déc ${y1})`;
      if (q === 3) return `T3 (Janv-Mars ${y2})`;
      return `T4 (Avr-Juin ${y2})`;
    });
    dateRangeStr = `trimestres ${qDetails.join(", ")}`;
  }

  descEl.innerHTML = `📅 Activités affichées : ${dateRangeStr}`;
}

function initPeriodSelector() {
  // Populate dropdown
  populateFiscalYears();

  // Wire quarter buttons toggling
  document.querySelectorAll(".quarter-toggle").forEach(btn => {
    const q = parseInt(btn.getAttribute("data-q") || "0", 10);

    // Set initial class
    if (appState.selected_quarters.includes(q)) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }

    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      const isActive = btn.classList.contains("active");

      if (isActive) {
        if (!appState.selected_quarters.includes(q)) {
          appState.selected_quarters.push(q);
        }
      } else {
        appState.selected_quarters = appState.selected_quarters.filter(x => x !== q);
      }

      saveDatabase();

      // Re-run validation if ledger has been loaded to update statuses immediately!
      if (reconciliationState.ledgerTransactions.length > 0) {
        reconcileLedger();
      }

      renderAll();
    });
  });

  // Wire year select
  const yearSelect = document.getElementById("top-fiscal-year") as HTMLSelectElement | null;
  if (yearSelect) {
    yearSelect.addEventListener("change", e => {
      appState.selected_year = (e.target as HTMLSelectElement).value;
      saveDatabase();

      // Re-run validation if ledger has been loaded to update statuses immediately!
      if (reconciliationState.ledgerTransactions.length > 0) {
        reconcileLedger();
      }

      renderAll();
    });
  }
}

function populateFiscalYears() {
  const select = document.getElementById("top-fiscal-year") as HTMLSelectElement | null;
  if (!select) return;

  // Base years
  const years = new Set(["2024-2025", "2025-2026", "2026-2027", "2027-2028", "2028-2029", "2029-2030"]);

  // Find any year from activities
  appState.activities.forEach(act => {
    if (act.deleted) return;
    if (act.date_start) {
      const fy = getFiscalYear(act.date_start);
      if (fy) years.add(fy);
    }
  });

  // Sort them
  const sortedYears = Array.from(years).sort();

  select.innerHTML = "";
  sortedYears.forEach(fy => {
    const isSelected = fy === appState.selected_year ? "selected" : "";
    select.innerHTML += `<option value="${fy}" ${isSelected}>${fy}</option>`;
  });
}

export { applyTheme, switchToView, initNavigation, renderView, renderAll, populateDropdowns, initPeriodSelector, renderQuickAccessAll };
