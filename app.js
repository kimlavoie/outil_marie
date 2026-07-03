/**
 * app.js - Application Logic for Espace Marie Accounting & Validation
 * Fully offline, no framework, CORS-compatible (no file:// fetch)
 */

// Embedded default configurations (Seed Data)
const DEFAULT_CONFIG = {
  rooms: [
    { name: "POLY", price_internal: 175.0, price_external: 0.0 },
    { name: "SALON", price_internal: 50.0, price_external: 100.0 },
    { name: "SFB-SALON-HALL", price_internal: 200.0, price_external: 0.0 },
    { name: "SFB-POLY", price_internal: 375.0, price_external: 0.0 },
    { name: "HALL SFB", price_internal: 0.0, price_external: 0.0 }
  ],
  departments: [
    "ACEECJ",
    "ANIMATION PÉDAGOGIQUE (ALEXANDRA  HÉBERT)",
    "BICQ",
    "BRI - BUREAU DE LA RECHERCHE ET DE L'INNOVATION",
    "CLIENT EXTERNE",
    "COMMUNICATION",
    "DIRECTION DES SERVICES INFORMATIONNELLES",
    "DIRECTION DES ÉTUDES (ENSEIGNANTS)",
    "DIRECTION GÉNÉRALE",
    "DRH - DIRECTION DES RESSOURCES HUMAINES",
    "DSATC",
    "FONDATION ASSELIN",
    "PARTENARIAT",
    "VIE ÉTUDIANTE (SOPHIE HUPPÉ)"
  ],
  accounts: [
    { code: "892-9020-00-849", description: "SCOLAIRE" },
    { code: "892-9020-01-849", description: "SCOLAIRE" },
    { code: "892-9020-04-849", description: "SCOLAIRE" },
    { code: "892-9020-00-851", description: "GOUV QC" },
    { code: "892-9020-01-851", description: "GOUV QC" },
    { code: "892-9020-04-851", description: "GOUV QC" },
    { code: "892-9020-00-853", description: "MUNICIPAL" },
    { code: "892-9020-01-853", description: "MUNICIPAL" },
    { code: "892-9020-04-853", description: "MUNICIPAL" },
    { code: "892-9020-00-864", description: "BAR SFB" },
    { code: "892-9020-01-864", description: "BAR POLY" },
    { code: "892-9020-00-869", description: "VESTIAIRE" },
    { code: "892-9020-01-869", description: "VESTIAIRE" },
    { code: "892-9020-00-870", description: "CIE EXTERNE (SFB, DT, HOTES)" },
    { code: "892-9020-01-870", description: "CIE EXTERNE (POLY, DT, HOTES)" },
    { code: "892-9020-04-870", description: "CIE EXTERNE (AGENT)" },
    { code: "892-9020-05-870", description: "CIE EXTERNE (PROJO CINÉ-CLUB)" },
    { code: "892-9020-06-870", description: "CIE EXTERNE (PROJO SFB)" },
    { code: "892-9020-07-870", description: "CIE EXTERNE (PROJO POLY)" },
    { code: "892-9020-00-889", description: "INTERNE (SFB, HOTES)" },
    { code: "892-9020-01-889", description: "INTERNE (POLY, HOTES)" },
    { code: "892-9020-04-889", description: "INTERNE (AGENT)" },
    { code: "892-9020-05-889", description: "INTERNE (PROJO CINÉ-CLUB)" },
    { code: "892-9020-06-889", description: "INTERNE (PROJO SFB)" },
    { code: "892-9020-07-889", description: "INTERNE (PROJO POLY)" }
  ]
};

const TECHNICAL_SERVICES = ["Microphone", "Écran projecteur", "Éclairage de scène", "Musique d'ambiance", "Fichier audio, vidéo ou présentation PowerPoint"];
const CONSUMPTION_OPTIONS = ["Consommation de breuvage avec alcool", "Consommation de breuvage sans alcool", "Cueillette au bar et paiement de ce qui est consommé", "Breuvages aux frais des participants (service de bar)", "Commande spéciale de produit"];
const HOST_SERVICES_OPTIONS = ["Service de bar payant", "Surveillance aux portes", "Distribution de breuvages et nettoyages de coupes", "Distribution de bouchées", "Aide au montage", "Aide au démontage"];
const EVENT_TYPES = [
  { value: "pedagogique", label: "Activité pédagogique" },
  { value: "parascolaire", label: "Activité parascolaire" },
  { value: "spectacle", label: "Spectacle" },
  { value: "conference", label: "Conférence" },
  { value: "diffusion", label: "Diffusion d'un film ou d'un court métrage" },
  { value: "autre", label: "Autre" }
];

// Global App State
let appState = {
  settings: {
    theme: "dark",
    rooms: [...DEFAULT_CONFIG.rooms],
    departments: [...DEFAULT_CONFIG.departments],
    accounts: [...DEFAULT_CONFIG.accounts],
    last_backup_date: "",
    backup_reminder_days: 7
  },
  activities: [],
  selected_year: "",
  selected_quarters: [1, 2, 3, 4]
};

// Period Helpers
function getFiscalYear(dateStr) {
  if (!dateStr) return "";
  const date = parseLocalDateStr(dateStr);
  if (isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-11
  return month >= 6 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function getQuarterNumber(dateStr) {
  if (!dateStr) return null;
  const date = parseLocalDateStr(dateStr);
  if (isNaN(date.getTime())) return null;
  const month = date.getMonth();
  if (month >= 6 && month <= 8) return 1;
  if (month >= 9 && month <= 11) return 2;
  if (month >= 0 && month <= 2) return 3;
  return 4;
}

function getDefaultFiscalYear() {
  const d = new Date();
  const year = d.getFullYear();
  const month = d.getMonth();
  return month >= 6 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

// Returns the {start, end} "YYYY-MM-DD" bounds (juillet à juin) of a fiscal year string like "2024-2025".
function getFiscalYearRange(fy) {
  if (!fy) return null;
  const match = /^(\d{4})-(\d{4})$/.exec(fy);
  if (!match) return null;
  return { start: `${match[1]}-07-01`, end: `${match[2]}-06-30` };
}

// Ledger State for Validation
let ledgerTransactions = [];
let reconciliationResults = [];
let currentReconFilter = "all";

// Chart instances
let chartQuarterly = null;
let chartSalle = null;
let chartAccounts = null;

// Initialize App
document.addEventListener("DOMContentLoaded", () => {
  loadDatabase();
  applyTheme(appState.settings.theme || "dark");
  initPeriodSelector();
  initNavigation();
  initFormHandlers();
  initActivityDetailModal();
  initSettingsHandlers();
  initReconciliationHandlers();
  initBackupHandlers();
  initCustomDatepickers();

  // Populate dropdowns once so restoreUiState() has real <option>s to select
  // from, then restore search/filter/sort/pagination state before the
  // sort-header classes and first render are set up.
  populateDropdowns();
  restoreUiState();
  initActivitiesSort();

  // Render initial views
  renderAll();

  // Restore the view the user was on before leaving/reloading the app
  const lastView = localStorage.getItem("outil_marie_last_view");
  const validViews = ["dashboard", "activities", "validation", "account-report", "settings", "backup"];
  if (lastView && validViews.includes(lastView) && lastView !== "dashboard") {
    switchToView(lastView);
  }

  updateStickyToolbarOffsets();

  window.addEventListener("resize", updateStickyToolbarOffsets);
  window.addEventListener("load", updateStickyToolbarOffsets);
});

// Load DB from LocalStorage
function loadDatabase() {
  const localData = localStorage.getItem("outil_marie_db");
  if (localData) {
    try {
      const parsed = JSON.parse(localData);
      appState.settings = parsed.settings || appState.settings;
      appState.activities = parsed.activities || [];
      appState.selected_year = parsed.selected_year || getDefaultFiscalYear();
      appState.selected_quarters = parsed.selected_quarters || [1, 2, 3, 4];
      
      // Safety check: ensure accounts, rooms, departments exist
      if (!appState.settings.accounts) appState.settings.accounts = [...DEFAULT_CONFIG.accounts];
      if (!appState.settings.rooms) appState.settings.rooms = [...DEFAULT_CONFIG.rooms];
      if (!appState.settings.departments) appState.settings.departments = [...DEFAULT_CONFIG.departments];
      if (appState.settings.last_backup_date === undefined) appState.settings.last_backup_date = "";
      appState.settings.backup_reminder_days = parseInt(appState.settings.backup_reminder_days, 10);
      if (isNaN(appState.settings.backup_reminder_days)) {
        appState.settings.backup_reminder_days = 7;
      }
      
      // Sort accounts by code
      if (appState.settings.accounts) {
        appState.settings.accounts.sort((a, b) => a.code.localeCompare(b.code));
      }

      migrateActivities();
    } catch (e) {
      console.error("Error parsing local database, using defaults", e);
      seedDatabase();
    }
  } else {
    seedDatabase();
  }
}

// Migrate legacy activity records to the current data shape (room_name -> rooms, new fields)
function migrateActivities() {
  appState.activities.forEach(act => {
    if (act.room_name !== undefined) {
      if (!act.rooms) act.rooms = act.room_name ? [act.room_name] : [];
      delete act.room_name;
    }
    if (!act.rooms) act.rooms = [];
    if (act.attendees_count === undefined) act.attendees_count = 0;
    if (act.install_date === undefined) act.install_date = "";
    if (act.install_time === undefined) act.install_time = "";
    if (act.dismantle_date === undefined) act.dismantle_date = "";
    if (act.dismantle_time === undefined) act.dismantle_time = "";
    if (act.start_time === undefined) act.start_time = "";
    if (act.end_time === undefined) act.end_time = "";
    if (act.description === undefined) act.description = "";
    if (!act.activity_manager) {
      act.activity_manager = { first_name: "", last_name: "", type: "employe", phone: "", email: "" };
    }
    if (!act.technical_services) act.technical_services = [];
    if (!act.consumption) act.consumption = [];
    if (act.consumption_special_products === undefined) act.consumption_special_products = "";
    if (!act.host_services) act.host_services = [];
    if (act.event_type === undefined) act.event_type = "";
    if (act.event_type_other === undefined) act.event_type_other = "";

    // Legacy: reference was a single field on the activity. Move it onto each
    // distribution (per-account reference) since it is now defined per compte.
    if (act.reference !== undefined) {
      (act.distributions || []).forEach(d => {
        if (d.reference === undefined) d.reference = act.reference;
      });
      delete act.reference;
    }
    (act.distributions || []).forEach(d => {
      if (d.reference === undefined) d.reference = "";
    });
  });
}

// Seed Initial Database with empty activities list
function seedDatabase() {
  appState.settings = {
    theme: "dark",
    rooms: [...DEFAULT_CONFIG.rooms],
    departments: [...DEFAULT_CONFIG.departments],
    accounts: [...DEFAULT_CONFIG.accounts].sort((a, b) => a.code.localeCompare(b.code)),
    last_backup_date: "",
    backup_reminder_days: 7
  };
  
  appState.activities = [];
  appState.selected_year = getDefaultFiscalYear();
  appState.selected_quarters = [1, 2, 3, 4];
  saveDatabase();
}

// Save state to LocalStorage
function saveDatabase() {
  localStorage.setItem("outil_marie_db", JSON.stringify(appState));
  checkBackupReminder();
}

// Persist search/filter/sort/pagination state per view, so reloading the
// page or coming back later drops the user exactly where they left off.
const UI_STATE_KEY = "outil_marie_ui_state";

function saveUiState() {
  const uiState = {
    activities: {
      search: document.getElementById("activity-search")?.value || "",
      filterSalle: document.getElementById("filter-salle")?.value || "",
      filterClientType: document.getElementById("filter-client-type")?.value || "",
      sortKey: currentSortKey,
      sortOrder: currentSortOrder,
      page: activitiesPage,
      pageSize: activitiesPageSize
    },
    reconciliation: {
      filter: currentReconFilter,
      page: reconciliationPage,
      pageSize: reconciliationPageSize
    },
    accountReport: {
      filterAccount: document.getElementById("filter-report-account")?.value || "",
      sortKey: accountReportSortKey,
      sortOrder: accountReportSortOrder,
      pageSize: accountReportPageSize,
      pages: accountReportPages
    }
  };
  localStorage.setItem(UI_STATE_KEY, JSON.stringify(uiState));
}

// Restores the UI state saved above. Must run after the DOM is ready and
// before the views first render, so the restored values are picked up by
// renderActivities/renderReconciliationTable/renderAccountReport on the
// initial render pass.
function restoreUiState() {
  const raw = localStorage.getItem(UI_STATE_KEY);
  if (!raw) return;

  let uiState;
  try {
    uiState = JSON.parse(raw);
  } catch (e) {
    console.error("Error parsing saved UI state, ignoring", e);
    return;
  }

  const act = uiState.activities || {};
  const searchEl = document.getElementById("activity-search");
  const salleEl = document.getElementById("filter-salle");
  const clientTypeEl = document.getElementById("filter-client-type");
  if (searchEl && act.search !== undefined) searchEl.value = act.search;
  if (salleEl && act.filterSalle !== undefined) salleEl.value = act.filterSalle;
  if (clientTypeEl && act.filterClientType !== undefined) clientTypeEl.value = act.filterClientType;
  if (act.sortKey) currentSortKey = act.sortKey;
  if (act.sortOrder) currentSortOrder = act.sortOrder;
  if (act.page) activitiesPage = act.page;
  if (act.pageSize) activitiesPageSize = act.pageSize;

  const recon = uiState.reconciliation || {};
  if (recon.filter) {
    currentReconFilter = recon.filter;
    document.querySelectorAll(".reconcile-tab").forEach(t => {
      t.classList.toggle("active", t.getAttribute("data-recon-filter") === recon.filter);
    });
  }
  if (recon.page) reconciliationPage = recon.page;
  if (recon.pageSize) reconciliationPageSize = recon.pageSize;

  const report = uiState.accountReport || {};
  const reportAccountEl = document.getElementById("filter-report-account");
  if (reportAccountEl && report.filterAccount !== undefined) reportAccountEl.value = report.filterAccount;
  if (report.sortKey) accountReportSortKey = report.sortKey;
  if (report.sortOrder) accountReportSortOrder = report.sortOrder;
  if (report.pageSize) accountReportPageSize = report.pageSize;
  if (report.pages) accountReportPages = report.pages;
}

// Theme management
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  appState.settings.theme = theme;
  
  const themeBtn = document.getElementById("theme-toggle");
  const sunIcon = document.getElementById("theme-sun-icon");
  const moonIcon = document.getElementById("theme-moon-icon");
  const btnText = document.getElementById("theme-btn-text");
  
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
function switchToView(view) {
  const navItems = document.querySelectorAll(".nav-item");
  const sections = document.querySelectorAll(".view-section");
  const viewTitle = document.getElementById("view-title");
  const targetSection = document.getElementById(`view-${view}`);
  if (!targetSection) return;

  // Update active nav item
  navItems.forEach(i => i.classList.toggle("active", i.getAttribute("data-view") === view));

  // Switch active section
  sections.forEach(s => s.classList.remove("active"));
  targetSection.classList.add("active");

  // Set top bar title
  const labels = {
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
      switchToView(item.getAttribute("data-view"));
    });
  });

  // Theme toggle button
  document.getElementById("theme-toggle").addEventListener("click", () => {
    const currentTheme = appState.settings.theme === "light" ? "dark" : "light";
    applyTheme(currentTheme);
    saveDatabase();
    // Re-draw charts in case colors need to adjust (Chart.js respects theme context changes if redrawn)
    if (document.getElementById("view-dashboard").classList.contains("active")) {
      renderDashboardCharts();
    }
  });
  
  // Quick Export Excel Header button
  document.getElementById("quick-export-excel").addEventListener("click", () => {
    exportToExcel();
  });

  // Account report dropdown filter listener
  const filterRepSelect = document.getElementById("filter-report-account");
  if (filterRepSelect) {
    filterRepSelect.addEventListener("change", () => {
      renderAccountReport();
    });
  }
}

// Render dynamic elements for a specific view
function renderView(view) {
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
  updateStickyToolbarOffsets();
  checkBackupReminder();
}

// Measures each .table-toolbar and exposes its height as a CSS variable on its
// parent .table-card, so sticky column headers below it can offset by that height
// instead of overlapping the sticky search/filter bar.
function updateStickyToolbarOffsets() {
  document.querySelectorAll(".table-card").forEach(card => {
    const toolbar = card.querySelector(".table-toolbar");
    if (toolbar) {
      card.style.setProperty("--table-toolbar-height", `${toolbar.offsetHeight}px`);
    }
  });
}

function renderAll() {
  // Populates dropdown selects in modals and forms
  populateDropdowns();
  
  // Render currently active view
  const activeNav = document.querySelector(".nav-item.active");
  if (activeNav) {
    renderView(activeNav.getAttribute("data-view"));
  }
}

// Populate dropdown elements globally
function populateDropdowns() {
  const filterSalleSelect = document.getElementById("filter-salle");
  const deptsSelects = [
    document.getElementById("form-activity-dept")
  ];

  // Filter Salle dropdown (single-select filter, unaffected by multi-room support)
  if (filterSalleSelect) {
    const previousSalleValue = filterSalleSelect.value;
    filterSalleSelect.innerHTML = '<option value="">Toutes les salles</option>';
    appState.settings.rooms.forEach(r => {
      filterSalleSelect.innerHTML += `<option value="${r.name}">${r.name} (Int: ${r.price_internal}$, Ext: ${r.price_external}$)</option>`;
    });
    filterSalleSelect.value = previousSalleValue;
  }

  // Form Salle pill group (multi-select)
  const salleGroup = document.getElementById("form-activity-salle-group");
  if (salleGroup) {
    const previouslyActive = Array.from(salleGroup.querySelectorAll(".pill-toggle.active")).map(b => b.dataset.value);
    salleGroup.innerHTML = "";
    appState.settings.rooms.forEach(r => {
      const isActive = previouslyActive.includes(r.name);
      salleGroup.innerHTML += `<button type="button" class="pill-toggle${isActive ? ' active' : ''}" data-value="${r.name}">${r.name}</button>`;
    });
  }

  // Form Services techniques pill group (multi-select, static list)
  const servicesGroup = document.getElementById("form-activity-services-group");
  if (servicesGroup && !servicesGroup.dataset.populated) {
    servicesGroup.innerHTML = TECHNICAL_SERVICES.map(s => `<button type="button" class="pill-toggle" data-value="${s}">${s}</button>`).join("");
    servicesGroup.dataset.populated = "true";
  }

  // Form Consommation pill group (multi-select, static list)
  const consumptionGroup = document.getElementById("form-activity-consumption-group");
  if (consumptionGroup && !consumptionGroup.dataset.populated) {
    consumptionGroup.innerHTML = CONSUMPTION_OPTIONS.map(s => `<button type="button" class="pill-toggle" data-value="${s}">${s}</button>`).join("");
    consumptionGroup.dataset.populated = "true";
  }

  // Form Service d'hôtes.ses pill group (multi-select, static list)
  const hostServicesGroup = document.getElementById("form-activity-host-services-group");
  if (hostServicesGroup && !hostServicesGroup.dataset.populated) {
    hostServicesGroup.innerHTML = HOST_SERVICES_OPTIONS.map(s => `<button type="button" class="pill-toggle" data-value="${s}">${s}</button>`).join("");
    hostServicesGroup.dataset.populated = "true";
  }

  // Form Event type dropdown
  const eventTypeSelect = document.getElementById("form-activity-event-type");
  if (eventTypeSelect && !eventTypeSelect.dataset.populated) {
    eventTypeSelect.innerHTML = '<option value="">Sélectionner...</option>' +
      EVENT_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join("");
    eventTypeSelect.dataset.populated = "true";
  }

  // Departments dropdowns
  deptsSelects.forEach(select => {
    if (!select) return;
    select.innerHTML = '<option value="">Sélectionner un département...</option>';
    appState.settings.departments.forEach(d => {
      select.innerHTML += `<option value="${d}">${d}</option>`;
    });
  });

  // Account report dropdown filter
  const reportAccountSelect = document.getElementById("filter-report-account");
  if (reportAccountSelect) {
    const previousReportValue = reportAccountSelect.value;
    reportAccountSelect.innerHTML = '<option value="">Tous les comptes</option>';
    appState.settings.accounts.forEach(acc => {
      reportAccountSelect.innerHTML += `<option value="${acc.code}">${acc.code} (${acc.description})</option>`;
    });
    reportAccountSelect.value = previousReportValue;
  }
}

// Helper: Format currencies in standard FR-CA format
function formatCurrency(val) {
  return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(val);
}

// Helper: Calculate days between dates (inclusive)
function calculateDaysCount(startStr, endStr) {
  if (!startStr || !endStr) return 1;
  const start = new Date(startStr);
  const end = new Date(endStr);
  if (isNaN(start) || isNaN(end)) return 1;
  const diffTime = end - start;
  if (diffTime < 0) return 1;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

// Joined list of distinct RI/Facture references across an activity's per-account distributions
function getActivityReferences(act) {
  const refs = (act.distributions || []).map(d => (d.reference || "").trim()).filter(Boolean);
  return [...new Set(refs)].join(", ");
}

// Sum of price_internal across all rooms booked for an activity
function getRoomsInternalPrice(act) {
  return (act.rooms || []).reduce((sum, name) => {
    const room = appState.settings.rooms.find(r => r.name === name);
    return sum + (room ? room.price_internal : 0);
  }, 0);
}

// Helper: Check which quarter a date belongs to
function getQuarter(dateStr) {
  if (!dateStr) return null;
  const date = parseLocalDateStr(dateStr);
  if (isNaN(date)) return null;
  const month = date.getMonth(); // 0-11
  // Q1: Jul-Sep (months 6, 7, 8)
  // Q2: Oct-Dec (months 9, 10, 11)
  // Q3: Jan-Mar (months 0, 1, 2)
  // Q4: Apr-Jun (months 3, 4, 5)
  if (month >= 6 && month <= 8) return "T1 (Jul-Sep)";
  if (month >= 9 && month <= 11) return "T2 (Oct-Dec)";
  if (month >= 0 && month <= 2) return "T3 (Jan-Mar)";
  return "T4 (Apr-Jun)";
}


/* ==========================================================================
   1. DASHBOARD VIEW CONTROLLER
   ========================================================================== */

function renderDashboard() {
  let totalRevenue = 0;
  let totalInternalFree = 0;
  let filledCount = 0;
  
  appState.activities.forEach(act => {
    const isFilled = act.name.trim() !== "";
    if (!isFilled) return;
    
    // Period filter
    const actYear = getFiscalYear(act.date_start);
    const actQuarter = getQuarterNumber(act.date_start);
    if (actYear !== appState.selected_year || !appState.selected_quarters.includes(actQuarter)) {
      return;
    }
    
    filledCount++;
    
    // Revenue sum for this activity
    const activityRevenue = act.distributions.reduce((sum, dist) => sum + dist.amount, 0);
    totalRevenue += activityRevenue;
    
    // Internal free valuation: client is internal, and no actual charge (revenue is zero)
    if (act.client_type === "interne" && activityRevenue === 0) {
      const days = calculateDaysCount(act.date_start, act.date_end);
      const price = getRoomsInternalPrice(act);
      totalInternalFree += days * price;
    }
  });
  
  document.getElementById("stat-revenue-total").textContent = formatCurrency(totalRevenue);
  document.getElementById("stat-revenue-internal-free").textContent = formatCurrency(totalInternalFree);
  document.getElementById("stat-activities-count").textContent = filledCount;
  
  // Reconciliation Rate
  let reconciliationRate = 0;
  if (reconciliationResults.length > 0) {
    const validCount = reconciliationResults.filter(r => r.status === "valid").length;
    // Rate is valid divided by total matched records in ledger/application
    // Let's filter records that are relevant (exclude ledger-only missing entries)
    const appRecordsCount = reconciliationResults.filter(r => r.status !== "unentered").length;
    if (appRecordsCount > 0) {
      reconciliationRate = Math.round((validCount / appRecordsCount) * 100);
    }
  }
  document.getElementById("stat-reconciled-percent").textContent = `${reconciliationRate}%`;
  
  // Render charts
  renderDashboardCharts();
}

function renderDashboardCharts() {
  const isDark = appState.settings.theme === "dark";
  const gridColor = isDark ? "#1f2937" : "#e2e8f0";
  const textColor = isDark ? "#9ca3af" : "#475569";
  
  // 1. Quarterly Revenues
  const quarterlySums = {
    "T1 (Jul-Sep)": 0,
    "T2 (Oct-Dec)": 0,
    "T3 (Jan-Mar)": 0,
    "T4 (Apr-Jun)": 0
  };
  
  appState.activities.forEach(act => {
    if (act.name.trim() === "") return;
    
    // Period filter (check fiscal year only for quarters breakdown)
    if (getFiscalYear(act.date_start) !== appState.selected_year) return;
    
    const q = getQuarter(act.date_start);
    if (q && quarterlySums.hasOwnProperty(q)) {
      const sumDist = act.distributions.reduce((sum, dist) => sum + dist.amount, 0);
      quarterlySums[q] += sumDist;
    }
  });
  
  if (chartQuarterly) chartQuarterly.destroy();
  const ctxQ = document.getElementById("chart-quarterly-revenues").getContext("2d");
  chartQuarterly = new Chart(ctxQ, {
    type: "bar",
    data: {
      labels: Object.keys(quarterlySums),
      datasets: [{
        label: "Revenus réels ($)",
        data: Object.values(quarterlySums),
        backgroundColor: "rgba(59, 130, 246, 0.75)",
        borderColor: "#3b82f6",
        borderWidth: 2,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: textColor } },
        y: { grid: { color: gridColor }, ticks: { color: textColor } }
      }
    }
  });
  
  // 2. Revenue share by Room (salle)
  const roomSums = {};
  appState.activities.forEach(act => {
    if (act.name.trim() === "") return;
    
    // Period filter
    const actYear = getFiscalYear(act.date_start);
    const actQuarter = getQuarterNumber(act.date_start);
    if (actYear !== appState.selected_year || !appState.selected_quarters.includes(actQuarter)) {
      return;
    }
    
    const rName = (act.rooms && act.rooms.length) ? act.rooms.join(", ") : "Inconnue";
    const sumDist = act.distributions.reduce((sum, dist) => sum + dist.amount, 0);
    roomSums[rName] = (roomSums[rName] || 0) + sumDist;
  });
  
  const roomLabels = Object.keys(roomSums);
  const roomData = Object.values(roomSums);
  
  if (chartSalle) chartSalle.destroy();
  const ctxS = document.getElementById("chart-salle-share").getContext("2d");
  
  if (roomLabels.length === 0) {
    roomLabels.push("Aucune donnée");
    roomData.push(1);
  }
  
  chartSalle = new Chart(ctxS, {
    type: "doughnut",
    data: {
      labels: roomLabels,
      datasets: [{
        data: roomData,
        backgroundColor: [
          "#3b82f6", // Blue
          "#10b981", // Green
          "#8b5cf6", // Purple
          "#f59e0b", // Yellow/Orange
          "#f43f5e", // Pink/Red
          "#14b8a6", // Teal
        ],
        borderWidth: isDark ? 2 : 1,
        borderColor: isDark ? "#111827" : "#ffffff"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: textColor, boxWidth: 12, padding: 16 }
        }
      }
    }
  });
  
  // 3. Revenues by Account
  const accountSums = {};
  appState.activities.forEach(act => {
    if (act.name.trim() === "") return;
    
    // Period filter
    const actYear = getFiscalYear(act.date_start);
    const actQuarter = getQuarterNumber(act.date_start);
    if (actYear !== appState.selected_year || !appState.selected_quarters.includes(actQuarter)) {
      return;
    }
    
    act.distributions.forEach(dist => {
      if (dist.amount > 0) {
        accountSums[dist.account_code] = (accountSums[dist.account_code] || 0) + dist.amount;
      }
    });
  });
  
  // Sort accounts by amount descending
  const sortedAccounts = Object.entries(accountSums)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8); // Top 8 accounts
  
  const accLabels = sortedAccounts.map(item => item[0]);
  const accData = sortedAccounts.map(item => item[1]);
  
  if (chartAccounts) chartAccounts.destroy();
  const ctxA = document.getElementById("chart-accounts-volume").getContext("2d");
  chartAccounts = new Chart(ctxA, {
    type: "bar",
    data: {
      labels: accLabels,
      datasets: [{
        label: "Revenus ($)",
        data: accData,
        backgroundColor: "rgba(139, 92, 246, 0.75)",
        borderColor: "#8b5cf6",
        borderWidth: 2,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: textColor } },
        y: { grid: { color: gridColor }, ticks: { color: textColor } }
      }
    }
  });
}


/* ==========================================================================
   2. ACTIVITIES VIEW CONTROLLER (CRUD)
   ========================================================================== */

let activeActivityId = null;
let isDraftDirty = false;
let currentSortKey = "id";
let currentSortOrder = "asc";
let accountReportSortKey = "id";
let accountReportSortOrder = "asc";

// Pagination state
let activitiesPage = 1;
let activitiesPageSize = 10;
let reconciliationPage = 1;
let reconciliationPageSize = 10;
let accountReportPageSize = 10;
let accountReportPages = {}; // { [accountCode]: pageNumber }

/* ==========================================================================
   1.5 GENERIC TABLE PAGINATION HELPER
   ========================================================================== */

// Pure HTML builder for a pagination bar's contents. Buttons/select carry an
// optional data-attribute (extraAttr) so a delegated listener can identify
// which instance was interacted with when several bars share one ancestor.
function buildPaginationBarHtml({ page, pageSize, totalItems, extraAttr = "" }) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  const startItem = (clampedPage - 1) * pageSize + 1;
  const endItem = Math.min(clampedPage * pageSize, totalItems);

  return {
    clampedPage,
    html: `
      <div class="pagination-info">${startItem}–${endItem} sur ${totalItems}</div>
      <div class="pagination-controls">
        <button type="button" class="btn-icon pagination-prev" ${extraAttr} ${clampedPage <= 1 ? "disabled" : ""} title="Page précédente">
          <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
        </button>
        <span class="pagination-page-label">Page ${clampedPage} / ${totalPages}</span>
        <button type="button" class="btn-icon pagination-next" ${extraAttr} ${clampedPage >= totalPages ? "disabled" : ""} title="Page suivante">
          <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>
        </button>
        <select class="select-input pagination-size-select" ${extraAttr} title="Lignes par page">
          ${[5, 10, 25, 50, 100].map(n => `<option value="${n}" ${n === pageSize ? "selected" : ""}>${n} / page</option>`).join("")}
        </select>
      </div>
    `
  };
}

// Renders a pagination bar into the given container element, and wires up its
// controls directly. Only safe for containers whose innerHTML is replaced
// wholesale on each render (not appended to in a loop) — see
// buildPaginationBarHtml for the loop-safe, delegation-friendly alternative.
// Returns the (possibly clamped) current page, so callers can slice their
// data with the corrected value.
function renderPaginationBar(container, { page, pageSize, totalItems, onPageChange, onPageSizeChange }) {
  if (!container) return page;

  if (totalItems === 0) {
    container.innerHTML = "";
    return page;
  }

  const { clampedPage, html } = buildPaginationBarHtml({ page, pageSize, totalItems });
  container.innerHTML = html;

  container.querySelector(".pagination-prev").addEventListener("click", () => onPageChange(clampedPage - 1));
  container.querySelector(".pagination-next").addEventListener("click", () => onPageChange(clampedPage + 1));
  container.querySelector(".pagination-size-select").addEventListener("change", (e) => onPageSizeChange(parseInt(e.target.value, 10)));

  return clampedPage;
}

function renderActivities() {
  saveUiState();
  const tbody = document.getElementById("activities-table-body");
  const searchQuery = document.getElementById("activity-search").value.toLowerCase();
  const filterSalle = document.getElementById("filter-salle").value;
  const filterClientType = document.getElementById("filter-client-type").value;
  
  tbody.innerHTML = "";
  
  // Filter activities
  const filtered = appState.activities.filter(act => {
    // Search filter: ID, Name, Responsable, Reference, or any ventilated Account Code
    const matchesSearch =
      act.id.toLowerCase().includes(searchQuery) ||
      act.name.toLowerCase().includes(searchQuery) ||
      act.responsable.toLowerCase().includes(searchQuery) ||
      act.distributions.some(d =>
        d.account_code.toLowerCase().includes(searchQuery) ||
        (d.reference || "").toLowerCase().includes(searchQuery)
      );
      
    // Salle filter
    const matchesSalle = !filterSalle || (act.rooms || []).includes(filterSalle);
    
    // Client type filter
    const matchesClientType = !filterClientType || act.client_type === filterClientType;
    
    // Period filter
    let matchesPeriod = false;
    if (!act.date_start) {
      matchesPeriod = true;
    } else {
      const fy = getFiscalYear(act.date_start);
      const q = getQuarterNumber(act.date_start);
      matchesPeriod = (fy === appState.selected_year) && appState.selected_quarters.includes(q);
    }
    
    return matchesSearch && matchesSalle && matchesClientType && matchesPeriod;
  });
  
  // Sort filtered activities
  filtered.sort((a, b) => {
    let valA = "";
    let valB = "";
    
    switch (currentSortKey) {
      case "id":
        valA = a.id;
        valB = b.id;
        break;
      case "name":
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
        break;
      case "responsable":
        valA = (a.responsable || "").toLowerCase();
        valB = (b.responsable || "").toLowerCase();
        break;
      case "date_start":
        valA = a.date_start || "";
        valB = b.date_start || "";
        break;
      case "room_name":
        valA = (a.rooms || []).join(", ").toLowerCase();
        valB = (b.rooms || []).join(", ").toLowerCase();
        break;
      case "reference":
        valA = getActivityReferences(a).toLowerCase();
        valB = getActivityReferences(b).toLowerCase();
        break;
      case "totalRev":
        valA = a.distributions.reduce((sum, d) => sum + d.amount, 0);
        valB = b.distributions.reduce((sum, d) => sum + d.amount, 0);
        break;
      case "sansFrais":
        const daysA = calculateDaysCount(a.date_start, a.date_end);
        const priceA = getRoomsInternalPrice(a);
        valA = a.client_type === "interne" ? (daysA * priceA) : 0;

        const daysB = calculateDaysCount(b.date_start, b.date_end);
        const priceB = getRoomsInternalPrice(b);
        valB = b.client_type === "interne" ? (daysB * priceB) : 0;
        break;
    }
    
    // Use localeCompare for strings (accents robust) and subtraction for numbers
    if (typeof valA === "string" && typeof valB === "string") {
      return currentSortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
    } else {
      return currentSortOrder === "asc" ? valA - valB : valB - valA;
    }
  });
  
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="color: var(--text-muted); padding: 32px;">Aucune activité trouvée. Cliquez sur "+ Nouvelle Activité" pour en créer une.</td></tr>`;
    renderPaginationBar(document.getElementById("activities-pagination"), { page: activitiesPage, pageSize: activitiesPageSize, totalItems: 0, onPageChange: () => {}, onPageSizeChange: () => {} });
    return;
  }

  activitiesPage = renderPaginationBar(document.getElementById("activities-pagination"), {
    page: activitiesPage,
    pageSize: activitiesPageSize,
    totalItems: filtered.length,
    onPageChange: (p) => { activitiesPage = p; renderActivities(); },
    onPageSizeChange: (s) => { activitiesPageSize = s; activitiesPage = 1; renderActivities(); }
  });
  const pageItems = filtered.slice((activitiesPage - 1) * activitiesPageSize, activitiesPage * activitiesPageSize);

  pageItems.forEach(act => {
    const isFilled = act.name.trim() !== "";
    const totalRev = act.distributions.reduce((sum, d) => sum + d.amount, 0);
    
    // Format distributions for visualization
    let distHtml = "";
    if (isFilled && act.distributions && act.distributions.length > 0) {
      distHtml = `
        <div class="activity-dist-list" style="margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px; font-size: 0.72rem;">
          ${act.distributions.map(d => {
            const accDesc = appState.settings.accounts.find(a => a.code === d.account_code)?.description || '';
            return `
              <span class="font-mono" style="background-color: var(--bg-main); border: 1px solid var(--border-color); padding: 2px 6px; border-radius: var(--radius-sm); color: var(--text-secondary);" title="${accDesc}">
                <strong>${d.account_code}</strong>: ${formatCurrency(d.amount)}${d.reference ? ` (${d.reference})` : ''}
              </span>
            `;
          }).join("")}
        </div>
      `;
    }
    
    // Format dates
    let datesText = "-";
    let daysCount = 0;
    if (act.date_start || act.date_end) {
      if (act.date_start && act.date_end) {
        daysCount = calculateDaysCount(act.date_start, act.date_end);
        const start = parseLocalDateStr(act.date_start).toLocaleDateString('fr-CA', {month: 'short', day: 'numeric'});
        const end = parseLocalDateStr(act.date_end).toLocaleDateString('fr-CA', {month: 'short', day: 'numeric'});
        datesText = `${start} au ${end} (${daysCount}j)`;
      } else if (act.date_start) {
        const start = parseLocalDateStr(act.date_start).toLocaleDateString('fr-CA', {month: 'short', day: 'numeric'});
        datesText = `À partir du ${start}`;
      } else if (act.date_end) {
        const end = parseLocalDateStr(act.date_end).toLocaleDateString('fr-CA', {month: 'short', day: 'numeric'});
        datesText = `Jusqu'au ${end}`;
      }
    }
    
    // Sans Frais estimated cost if internal client
    let sansFraisText = "-";
    if (act.client_type === "interne" && isFilled) {
      const price = getRoomsInternalPrice(act);
      sansFraisText = formatCurrency(daysCount * price);
    }
    
    // Reconciliation badge if ledger file has been uploaded
    const activityReferences = getActivityReferences(act);
    let statusBadge = "";
    if (ledgerTransactions.length > 0 && isFilled && activityReferences) {
      // Find reconciliation statuses for this activity
      const related = reconciliationResults.filter(r => r.activityId === act.id);
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
    
    tbody.innerHTML += `
      <tr class="activity-row ${isFilled ? '' : 'row-empty'}" data-id="${act.id}" style="cursor: pointer; ${isFilled ? '' : 'opacity: 0.5; font-style: italic;'}">
        <td class="font-mono bold">${act.id}</td>
        <td>
          <span class="bold">${isFilled ? act.name : 'Vierge'}</span> ${statusBadge}
          ${distHtml}
        </td>
        <td>${isFilled && act.responsable ? act.responsable : '-'}</td>
        <td>${datesText}</td>
        <td>${isFilled ? `${(act.rooms || []).join(", ")} (${act.client_type})` : '-'}</td>
        <td class="font-mono">${isFilled && activityReferences ? activityReferences : '-'}</td>
        <td class="bold">${isFilled ? formatCurrency(totalRev) : '-'}</td>
        <td style="color: var(--text-muted);">${sansFraisText}</td>
        <td class="text-right" style="white-space: nowrap;">
          <button class="btn-icon edit-act-btn" data-id="${act.id}" title="Modifier" style="margin-right: 4px;">
            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>
          ${isFilled ? `
          <button class="btn-icon duplicate-act-btn" data-id="${act.id}" title="Dupliquer" style="margin-right: 4px;">
            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
          </button>
          ` : ''}
          <button class="btn-icon delete-act-list-btn" data-id="${act.id}" title="Supprimer" style="color: var(--danger);">
            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </td>
      </tr>
    `;
  });

  // Attach row click listeners to open the read-only activity detail view
  document.querySelectorAll(".activity-row").forEach(row => {
    row.addEventListener("click", () => {
      openActivityDetailModal(row.getAttribute("data-id"));
    });
  });

  // Attach edit buttons event listeners
  document.querySelectorAll(".edit-act-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openActivityDrawer(btn.getAttribute("data-id"));
    });
  });

  // Attach duplicate buttons event listeners
  document.querySelectorAll(".duplicate-act-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openActivityDrawer(null, btn.getAttribute("data-id"));
    });
  });

  // Attach delete buttons event listeners
  document.querySelectorAll(".delete-act-list-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      if (confirm(`Voulez-vous vraiment supprimer l'activité ${id} ?`)) {
        appState.activities = appState.activities.filter(a => a.id !== id);
        saveDatabase();
        if (ledgerTransactions.length > 0) {
          reconcileLedger();
        }
        renderAll();
      }
    });
  });
}

function initFormHandlers() {
  const drawer = document.getElementById("activity-drawer");
  const backdrop = document.getElementById("drawer-backdrop");
  
  // Open drawers buttons
  document.getElementById("add-activity-btn-quick").addEventListener("click", () => openActivityDrawer());
  
  // Close buttons
  document.getElementById("activity-drawer-close").addEventListener("click", closeActivityDrawer);
  document.getElementById("activity-drawer-cancel").addEventListener("click", closeActivityDrawer);
  backdrop.addEventListener("click", closeActivityDrawer);
  
  // Inputs search
  const resetActivitiesPageAndRender = () => { activitiesPage = 1; renderActivities(); };
  document.getElementById("activity-search").addEventListener("input", resetActivitiesPageAndRender);
  document.getElementById("filter-salle").addEventListener("change", resetActivitiesPageAndRender);
  document.getElementById("filter-client-type").addEventListener("change", resetActivitiesPageAndRender);
  
  // Account distributions buttons
  document.getElementById("form-add-distribution-btn").addEventListener("click", () => {
    addDistributionRow("", 0);
    // Mark as dirty if adding a row in New Mode
    const internalId = document.getElementById("form-activity-internal-id").value;
    if (!internalId) {
      isDraftDirty = true;
    }
  });
  
  // Submit Form
  document.getElementById("activity-drawer-submit").addEventListener("click", submitActivityForm);
  
  // Delete Button
  document.getElementById("activity-drawer-delete").addEventListener("click", deleteActivity);

  // Mark form as dirty when inputs are typed or changed
  const actForm = document.getElementById("activity-form");
  actForm.addEventListener("input", () => {
    const internalId = document.getElementById("form-activity-internal-id").value;
    if (!internalId) {
      isDraftDirty = true;
    }
  });
  actForm.addEventListener("change", () => {
    const internalId = document.getElementById("form-activity-internal-id").value;
    if (!internalId) {
      isDraftDirty = true;
    }
  });
  
  // Dates helper updates
  document.getElementById("form-activity-start").addEventListener("input", updateFormDatesHelper);
  document.getElementById("form-activity-start").addEventListener("change", updateFormDatesHelper);
  document.getElementById("form-activity-end").addEventListener("input", updateFormDatesHelper);
  document.getElementById("form-activity-end").addEventListener("change", updateFormDatesHelper);

  // Phone number mask
  maskPhoneInput(document.getElementById("form-activity-manager-phone"));

  // Pill toggle groups (salles, services techniques, consommation, hôtes.ses)
  initPillToggle("form-activity-salle-group");
  initPillToggle("form-activity-services-group");
  initPillToggle("form-activity-consumption-group");
  initPillToggle("form-activity-host-services-group");

  // Consommation "Commande spéciale de produit" reveals a free-text field
  document.getElementById("form-activity-consumption-group").addEventListener("click", (e) => {
    const btn = e.target.closest(".pill-toggle");
    if (!btn || btn.dataset.value !== "Commande spéciale de produit") return;
    const specialGroup = document.getElementById("form-activity-consumption-special-group");
    specialGroup.style.display = btn.classList.contains("active") ? "flex" : "none";
    if (!btn.classList.contains("active")) {
      document.getElementById("form-activity-consumption-special").value = "";
    }
  });

  // Event type "Autre" reveals a free-text field
  document.getElementById("form-activity-event-type").addEventListener("change", (e) => {
    const otherGroup = document.getElementById("form-activity-event-type-other-group");
    otherGroup.style.display = e.target.value === "autre" ? "flex" : "none";
  });

  // Keyboard Shortcuts: Navigation, Add, and Escape
  window.addEventListener("keydown", (e) => {
    // Alt + [1-6] for switching tabs
    if (e.altKey && e.key >= '1' && e.key <= '6') {
      e.preventDefault();
      const views = ["dashboard", "activities", "validation", "account-report", "settings", "backup"];
      const targetView = views[parseInt(e.key) - 1];
      if (targetView) {
        const navBtn = document.querySelector(`.nav-item[data-view="${targetView}"] button`);
        if (navBtn) navBtn.click();
      }
    }
    
    // Alt + N or Alt + A to open the new activity drawer
    if (e.altKey && (e.key.toLowerCase() === 'n' || e.key.toLowerCase() === 'a')) {
      e.preventDefault();
      openActivityDrawer();
    }
    
    // Escape to close drawers and modals
    if (e.key === "Escape") {
      closeActivityDrawer();
      closeActivityDetailModal();
      if (typeof closeSettingsModal === "function") {
        closeSettingsModal("account");
        closeSettingsModal("room");
        closeSettingsModal("dept");
      }
    }
  });
}

// Fills the activity form fields (everything except the id/internal-id keys)
// from an existing activity object. Used by both Edit Mode and Duplicate Mode.
function fillActivityFormFields(act) {
  document.getElementById("form-activity-name").value = act.name;
  document.getElementById("form-activity-attendees").value = act.attendees_count || "";
  document.getElementById("form-activity-responsable").value = act.responsable;
  document.getElementById("form-activity-client-type").value = act.client_type;
  document.getElementById("form-activity-install-date").value = act.install_date || "";
  document.getElementById("form-activity-install-time").value = act.install_time || "";
  document.getElementById("form-activity-dismantle-date").value = act.dismantle_date || "";
  document.getElementById("form-activity-dismantle-time").value = act.dismantle_time || "";
  document.getElementById("form-activity-start").value = act.date_start;
  document.getElementById("form-activity-start-time").value = act.start_time || "";
  document.getElementById("form-activity-end").value = act.date_end;
  document.getElementById("form-activity-end-time").value = act.end_time || "";
  document.getElementById("form-activity-description").value = act.description || "";
  document.getElementById("form-activity-manager-firstname").value = act.activity_manager?.first_name || "";
  document.getElementById("form-activity-manager-lastname").value = act.activity_manager?.last_name || "";
  document.getElementById("form-activity-manager-type").value = act.activity_manager?.type || "employe";
  document.getElementById("form-activity-manager-phone").value = act.activity_manager?.phone || "";
  document.getElementById("form-activity-manager-email").value = act.activity_manager?.email || "";
  setPillGroupActive("form-activity-salle-group", act.rooms || []);
  setPillGroupActive("form-activity-services-group", act.technical_services || []);
  setPillGroupActive("form-activity-consumption-group", act.consumption || []);
  setPillGroupActive("form-activity-host-services-group", act.host_services || []);
  document.getElementById("form-activity-consumption-special").value = act.consumption_special_products || "";
  document.getElementById("form-activity-consumption-special-group").style.display = (act.consumption || []).includes("Commande spéciale de produit") ? "flex" : "none";
  document.getElementById("form-activity-remi").value = act.remi_hours;
  document.getElementById("form-activity-dept").value = act.department;
  document.getElementById("form-activity-event-type").value = act.event_type || "";
  document.getElementById("form-activity-event-type-other").value = act.event_type_other || "";
  document.getElementById("form-activity-event-type-other-group").style.display = act.event_type === "autre" ? "flex" : "none";

  // Load distributions
  (act.distributions || []).forEach(d => {
    addDistributionRow(d.account_code, d.amount, d.reference);
  });
}

// Generates the next available activity id (XXYY-ZZZ) for the selected fiscal year
function generateNextActivityId() {
  const prefix = appState.selected_year.split("-").map(y => y.substring(2)).join("");

  let maxSeq = 0;
  const regex = new RegExp(`^${prefix}-(\\d{3})$`);
  appState.activities.forEach(act => {
    const match = act.id.match(regex);
    if (match) {
      const seq = parseInt(match[1]);
      if (seq > maxSeq) {
        maxSeq = seq;
      }
    }
  });
  const nextSeq = String(maxSeq + 1).padStart(3, '0');
  return `${prefix}-${nextSeq}`;
}

// Drawer CRUD Operations
function openActivityDrawer(id = null, duplicateFromId = null) {
  const drawer = document.getElementById("activity-drawer");
  const backdrop = document.getElementById("drawer-backdrop");
  const form = document.getElementById("activity-form");
  const deleteBtn = document.getElementById("activity-drawer-delete");
  const titleEl = document.getElementById("activity-drawer-title");

  if (id) {
    // Edit Mode (Always reset and load the active activity)
    form.reset();
    document.getElementById("form-distribution-list").innerHTML = "";
    document.getElementById("form-distribution-total-val").textContent = "0,00 $";

    titleEl.textContent = `Modifier l'activité ${id}`;
    const act = appState.activities.find(a => a.id === id);
    if (act) {
      document.getElementById("form-activity-internal-id").value = act.id;
      document.getElementById("form-activity-id").value = act.id;
      document.getElementById("form-activity-id").disabled = true; // Cannot edit active key
      fillActivityFormFields(act);

      // Show delete button
      deleteBtn.style.display = "inline-flex";
    }
  } else if (duplicateFromId) {
    // Duplicate Mode (always builds a fresh form, ignoring any pending draft)
    titleEl.textContent = "Dupliquer l'activité";
    form.reset();
    document.getElementById("form-distribution-list").innerHTML = "";
    document.getElementById("form-distribution-total-val").textContent = "0,00 $";

    document.getElementById("form-activity-internal-id").value = "";
    const generatedId = generateNextActivityId();
    document.getElementById("form-activity-id").value = generatedId;
    document.getElementById("form-activity-id").disabled = true; // Auto-generated, no manual edits

    const sourceAct = appState.activities.find(a => a.id === duplicateFromId);
    if (sourceAct) {
      fillActivityFormFields(sourceAct);
    } else {
      addDistributionRow("", 0);
    }

    isDraftDirty = false;
    deleteBtn.style.display = "none";
  } else {
    // New Mode
    titleEl.textContent = "Ajouter une activité";

    // Only reset and build a fresh form if there is no active draft
    if (!isDraftDirty) {
      form.reset();
      document.getElementById("form-distribution-list").innerHTML = "";
      document.getElementById("form-distribution-total-val").textContent = "0,00 $";
      setPillGroupActive("form-activity-salle-group", []);
      setPillGroupActive("form-activity-services-group", []);
      setPillGroupActive("form-activity-consumption-group", []);
      setPillGroupActive("form-activity-host-services-group", []);
      document.getElementById("form-activity-consumption-special-group").style.display = "none";
      document.getElementById("form-activity-event-type-other-group").style.display = "none";

      document.getElementById("form-activity-internal-id").value = "";

      // Auto-generate ID: XXYY-ZZZ based on selected fiscal year
      const generatedId = generateNextActivityId();

      document.getElementById("form-activity-id").value = generatedId;
      document.getElementById("form-activity-id").disabled = true; // Auto-generated, no manual edits

      // Dates vides par défaut
      document.getElementById("form-activity-start").value = "";
      document.getElementById("form-activity-end").value = "";

      // Add one blank distribution row
      addDistributionRow("", 0);

      // Reset draft flag
      isDraftDirty = false;
    }

    // Hide delete button
    deleteBtn.style.display = "none";
  }

  updateFormDatesHelper();
  clearDateFieldErrors();

  drawer.classList.add("active");
  backdrop.classList.add("active");
  
  // Set cursor focus directly on the first editable field (Nom de l'activité)
  setTimeout(() => {
    document.getElementById("form-activity-name").focus();
  }, 150);
}

function closeActivityDrawer() {
  document.getElementById("activity-drawer").classList.remove("active");
  document.getElementById("drawer-backdrop").classList.remove("active");
}

function addDistributionRow(accountCode = "", amount = 0, reference = "") {
  const container = document.getElementById("form-distribution-list");
  const rowId = "dist-row-" + Date.now() + Math.random().toString(36).substr(2, 5);

  let optionsHtml = '<option value="">Choisir un compte...</option>';
  appState.settings.accounts.forEach(acc => {
    const isSelected = acc.code === accountCode ? 'selected' : '';
    optionsHtml += `<option value="${acc.code}" ${isSelected}>${acc.code} (${acc.description})</option>`;
  });

  const rowHtml = `
    <div id="${rowId}" class="distribution-row">
      <select class="select-input dist-account-select" style="padding: 8px 12px; font-size: 0.85rem;">
        ${optionsHtml}
      </select>
      <input type="number" class="form-input dist-amount-input" min="0" step="0.01" value="${amount > 0 ? amount : ''}" placeholder="Montant $" style="padding: 8px 12px; font-size: 0.85rem;">
      <input type="text" class="form-input dist-reference-input" value="${reference ? reference.replace(/"/g, '&quot;') : ''}" placeholder="N° Facture, RI ou Encaissement" style="padding: 8px 12px; font-size: 0.85rem;">
      <button type="button" class="btn-icon delete-dist-row-btn" data-row-id="${rowId}">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>
  `;
  
  container.insertAdjacentHTML("beforeend", rowHtml);
  
  // Attach listeners
  const newRow = document.getElementById(rowId);
  newRow.querySelector(".delete-dist-row-btn").addEventListener("click", () => {
    newRow.remove();
    updateDistributionTotal();
    // Mark as dirty if removing a row in New Mode
    const internalId = document.getElementById("form-activity-internal-id").value;
    if (!internalId) {
      isDraftDirty = true;
    }
  });
  
  newRow.querySelector(".dist-amount-input").addEventListener("input", updateDistributionTotal);
  
  updateDistributionTotal();
}

function updateDistributionTotal() {
  let total = 0;
  document.querySelectorAll(".dist-amount-input").forEach(input => {
    const val = parseFloat(input.value) || 0;
    total += val;
  });
  document.getElementById("form-distribution-total-val").textContent = formatCurrency(total);
}

function submitActivityForm(e) {
  e.preventDefault();
  
  const internalId = document.getElementById("form-activity-internal-id").value;
  const rawId = document.getElementById("form-activity-id").value.trim();
  const name = document.getElementById("form-activity-name").value.trim();
  const attendeesInput = document.getElementById("form-activity-attendees").value.trim();
  const attendeesCount = parseInt(attendeesInput) || 0;
  const responsable = document.getElementById("form-activity-responsable").value.trim();
  const clientType = document.getElementById("form-activity-client-type").value;
  const installDate = document.getElementById("form-activity-install-date").value;
  const installTime = document.getElementById("form-activity-install-time").value;
  const dismantleDate = document.getElementById("form-activity-dismantle-date").value;
  const dismantleTime = document.getElementById("form-activity-dismantle-time").value;
  const start = document.getElementById("form-activity-start").value;
  const startTime = document.getElementById("form-activity-start-time").value;
  const end = document.getElementById("form-activity-end").value;
  const endTime = document.getElementById("form-activity-end-time").value;
  const description = document.getElementById("form-activity-description").value.trim();
  const managerFirstName = document.getElementById("form-activity-manager-firstname").value.trim();
  const managerLastName = document.getElementById("form-activity-manager-lastname").value.trim();
  const managerType = document.getElementById("form-activity-manager-type").value;
  const managerPhone = document.getElementById("form-activity-manager-phone").value.trim();
  const managerEmail = document.getElementById("form-activity-manager-email").value.trim();
  const rooms = Array.from(document.querySelectorAll("#form-activity-salle-group .pill-toggle.active")).map(b => b.dataset.value);
  const technicalServices = Array.from(document.querySelectorAll("#form-activity-services-group .pill-toggle.active")).map(b => b.dataset.value);
  const consumption = Array.from(document.querySelectorAll("#form-activity-consumption-group .pill-toggle.active")).map(b => b.dataset.value);
  const consumptionSpecialProducts = document.getElementById("form-activity-consumption-special").value.trim();
  const hostServices = Array.from(document.querySelectorAll("#form-activity-host-services-group .pill-toggle.active")).map(b => b.dataset.value);
  const remiInput = document.getElementById("form-activity-remi").value.trim();
  const remi = parseFloat(remiInput) || 0;
  const dept = document.getElementById("form-activity-dept").value;
  const eventType = document.getElementById("form-activity-event-type").value;
  const eventTypeOther = document.getElementById("form-activity-event-type-other").value.trim();

  if (!rawId || !name) {
    alert("Veuillez remplir tous les champs obligatoires (*).");
    return;
  }

  if (eventType === "autre" && !eventTypeOther) {
    alert("Veuillez préciser le type d'événement.");
    return;
  }

  if (consumption.includes("Commande spéciale de produit") && !consumptionSpecialProducts) {
    alert("Veuillez préciser les produits pour la commande spéciale.");
    return;
  }

  // Date format YYYY-MM-DD validation
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (start) {
    if (!dateRegex.test(start) || isNaN(new Date(start).getTime())) {
      alert("La date de début doit être au format AAAA-MM-JJ (ex: 2026-09-01) et être une date valide.");
      return;
    }
  }
  if (end) {
    if (!dateRegex.test(end) || isNaN(new Date(end).getTime())) {
      alert("La date de fin doit être au format AAAA-MM-JJ (ex: 2026-09-03) et être une date valide.");
      return;
    }
  }
  
  if (start && end) {
    if (new Date(start) > new Date(end)) {
      alert("La date de début doit être antérieure ou égale à la date de fin.");
      return;
    }
  }

  // Restrict all activity dates to the active fiscal year
  const fyRange = getFiscalYearRange(appState.selected_year);
  if (fyRange) {
    const minDate = parseLocalDateStr(fyRange.start);
    const maxDate = parseLocalDateStr(fyRange.end);
    const datesToCheck = [
      { value: installDate, label: "La date d'installation" },
      { value: dismantleDate, label: "La date de démontage" },
      { value: start, label: "La date de début" },
      { value: end, label: "La date de fin" }
    ];
    for (const { value, label } of datesToCheck) {
      if (!value || !dateRegex.test(value)) continue;
      const d = parseLocalDateStr(value);
      if (!isNaN(d.getTime()) && (d < minDate || d > maxDate)) {
        alert(`${label} doit être comprise dans l'année financière active (${appState.selected_year}).`);
        return;
      }
    }
  }

  // Build distributions array
  const distributions = [];
  let distErrorMsg = "";
  
  document.querySelectorAll(".distribution-row").forEach(row => {
    const acc = row.querySelector(".dist-account-select").value;
    const amtStr = row.querySelector(".dist-amount-input").value.trim();
    const amt = parseFloat(amtStr) || 0;
    const reference = row.querySelector(".dist-reference-input").value.trim();

    if (acc && !amtStr) {
      distErrorMsg = "Veuillez entrer un montant pour chaque compte sélectionné.";
    } else if (acc && amt <= 0) {
      distErrorMsg = "Le montant d'une ventilation doit être supérieur à 0 $.";
    } else if (!acc && amtStr) {
      distErrorMsg = "Veuillez sélectionner un compte pour chaque montant de ventilation saisi.";
    } else if (acc && amt > 0) {
      distributions.push({ account_code: acc, amount: amt, reference });
    }
  });
  
  if (distErrorMsg) {
    alert(distErrorMsg);
    return;
  }
  
  const payload = {
    id: rawId,
    responsable,
    name,
    attendees_count: attendeesCount,
    date_start: start,
    date_end: end,
    start_time: startTime,
    end_time: endTime,
    install_date: installDate,
    install_time: installTime,
    dismantle_date: dismantleDate,
    dismantle_time: dismantleTime,
    description,
    activity_manager: {
      first_name: managerFirstName,
      last_name: managerLastName,
      type: managerType,
      phone: managerPhone,
      email: managerEmail
    },
    client_type: clientType,
    rooms,
    technical_services: technicalServices,
    consumption,
    consumption_special_products: consumption.includes("Commande spéciale de produit") ? consumptionSpecialProducts : "",
    host_services: hostServices,
    remi_hours: remi,
    department: dept,
    event_type: eventType,
    event_type_other: eventType === "autre" ? eventTypeOther : "",
    distributions
  };
  
  if (internalId) {
    // Edit existing activity
    const idx = appState.activities.findIndex(a => a.id === internalId);
    if (idx !== -1) {
      appState.activities[idx] = payload;
    }
  } else {
    // Add new custom activity (Check if code already exists)
    const exists = appState.activities.some(a => a.id === rawId);
    if (exists) {
      alert("Ce numéro d'activité existe déjà. Veuillez en choisir un autre.");
      return;
    }
    appState.activities.push(payload);
  }
  
  saveDatabase();
  closeActivityDrawer();
  isDraftDirty = false; // Reset draft flag upon successful submit
  
  // Re-run validation if ledger has been loaded to update statuses immediately!
  if (ledgerTransactions.length > 0) {
    reconcileLedger();
  }
  
  renderActivities();
}

function deleteActivity() {
  const id = document.getElementById("form-activity-internal-id").value;
  if (!id) return;
  
  if (confirm(`Êtes-vous sûr de vouloir supprimer l'activité ${id} ?`)) {
    // Delete the activity entirely from the database
    appState.activities = appState.activities.filter(a => a.id !== id);
    
    saveDatabase();
    closeActivityDrawer();
    if (ledgerTransactions.length > 0) {
      reconcileLedger();
    }
    renderActivities();
  }
}


/* ==========================================================================
   2.5 ACTIVITY DETAIL VIEW (Read-only summary modal)
   ========================================================================== */

let detailModalActivityId = null;

function initActivityDetailModal() {
  const modal = document.getElementById("activity-detail-modal");
  const backdrop = document.getElementById("modal-backdrop");

  document.getElementById("activity-detail-modal-close").addEventListener("click", closeActivityDetailModal);
  document.getElementById("activity-detail-close-btn").addEventListener("click", closeActivityDetailModal);
  backdrop.addEventListener("click", closeActivityDetailModal);

  document.getElementById("activity-detail-edit-btn").addEventListener("click", () => {
    const id = detailModalActivityId;
    closeActivityDetailModal();
    if (id) openActivityDrawer(id);
  });
}

// Human friendly date/time formatting, e.g. "3 juillet 2026 à 14 h 00"
function formatDetailDateTime(dateStr, timeStr) {
  if (!dateStr) return "-";
  const date = parseLocalDateStr(dateStr);
  if (isNaN(date.getTime())) return "-";
  let text = date.toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  if (timeStr) {
    text += ` à ${timeStr.replace(":", " h ")}`;
  }
  return text;
}

function openActivityDetailModal(id) {
  const act = appState.activities.find(a => a.id === id);
  if (!act) return;

  detailModalActivityId = id;

  document.getElementById("activity-detail-title").textContent = act.name.trim() !== "" ? act.name : "Activité vierge";
  document.getElementById("activity-detail-content").innerHTML = buildActivityDetailHtml(act);

  document.getElementById("activity-detail-modal").classList.add("active");
  document.getElementById("modal-backdrop").classList.add("active");
}

function closeActivityDetailModal() {
  document.getElementById("activity-detail-modal").classList.remove("active");
  document.getElementById("modal-backdrop").classList.remove("active");
  detailModalActivityId = null;
}

function buildActivityDetailHtml(act) {
  const isFilled = act.name.trim() !== "";
  const totalRev = act.distributions.reduce((sum, d) => sum + d.amount, 0);
  const days = calculateDaysCount(act.date_start, act.date_end);
  const sansFrais = act.client_type === "interne" ? days * getRoomsInternalPrice(act) : 0;

  // Reconciliation badge, mirrors the list view logic
  let statusBadge = "";
  const activityReferences = getActivityReferences(act);
  if (ledgerTransactions.length > 0 && isFilled && activityReferences) {
    const related = reconciliationResults.filter(r => r.activityId === act.id);
    if (related.length > 0) {
      const hasDiff = related.some(r => r.status === "diff");
      const hasUnlogged = related.some(r => r.status === "unlogged");
      const allValid = related.every(r => r.status === "valid");
      if (allValid) statusBadge = `<span class="badge badge-success">Rapproché</span>`;
      else if (hasDiff) statusBadge = `<span class="badge badge-danger">Écart montant</span>`;
      else if (hasUnlogged) statusBadge = `<span class="badge badge-warning">Non dans GL</span>`;
    }
  }

  const clientTypeBadge = act.client_type === "interne"
    ? `<span class="badge badge-info">Interne</span>`
    : act.client_type === "externe"
      ? `<span class="badge badge-warning">Externe</span>`
      : "";

  const eventTypeLabel = act.event_type === "autre"
    ? (act.event_type_other || "Autre")
    : (EVENT_TYPES.find(t => t.value === act.event_type)?.label || "-");

  const manager = act.activity_manager || {};
  const managerName = [manager.first_name, manager.last_name].filter(Boolean).join(" ") || "-";
  const managerTypeLabel = manager.type === "etudiant" ? "Étudiant" : manager.type === "externe" ? "Externe" : manager.type === "employe" ? "Employé" : "-";

  const tagsOrDash = (arr) => (arr && arr.length)
    ? `<div class="detail-tags">${arr.map(v => `<span class="detail-tag">${v}</span>`).join("")}</div>`
    : `<span class="detail-row-value">-</span>`;

  const distRows = (act.distributions || []).map(d => {
    const accDesc = appState.settings.accounts.find(a => a.code === d.account_code)?.description || '';
    return `
      <tr>
        <td class="font-mono">${d.account_code}</td>
        <td>${accDesc}</td>
        <td>${d.reference || '-'}</td>
        <td class="text-right bold">${formatCurrency(d.amount)}</td>
      </tr>
    `;
  }).join("");

  return `
    <div class="detail-hero">
      <div>
        <div class="detail-hero-name">${isFilled ? act.name : 'Activité vierge'}</div>
        <div class="detail-hero-id font-mono">${act.id}</div>
      </div>
      <div class="detail-hero-badges">
        ${clientTypeBadge}
        ${statusBadge}
      </div>
    </div>

    <div class="detail-stats-grid">
      <div class="detail-stat-box">
        <div class="detail-stat-box-val">${formatCurrency(totalRev)}</div>
        <div class="detail-stat-box-lbl">Revenu saisi</div>
      </div>
      <div class="detail-stat-box">
        <div class="detail-stat-box-val">${act.client_type === "interne" ? formatCurrency(sansFrais) : '-'}</div>
        <div class="detail-stat-box-lbl">Sans frais</div>
      </div>
      <div class="detail-stat-box">
        <div class="detail-stat-box-val">${days}</div>
        <div class="detail-stat-box-lbl">Jour(s)</div>
      </div>
      <div class="detail-stat-box">
        <div class="detail-stat-box-val">${act.attendees_count || 0}</div>
        <div class="detail-stat-box-lbl">Personnes attendues</div>
      </div>
    </div>

    <div class="detail-section-title">Dates et horaires</div>
    <div class="detail-grid">
      <div>
        <div class="detail-row-label">Installation</div>
        <div class="detail-row-value">${formatDetailDateTime(act.install_date, act.install_time)}</div>
      </div>
      <div>
        <div class="detail-row-label">Démontage</div>
        <div class="detail-row-value">${formatDetailDateTime(act.dismantle_date, act.dismantle_time)}</div>
      </div>
      <div>
        <div class="detail-row-label">Début de l'événement</div>
        <div class="detail-row-value">${formatDetailDateTime(act.date_start, act.start_time)}</div>
      </div>
      <div>
        <div class="detail-row-label">Fin de l'événement</div>
        <div class="detail-row-value">${formatDetailDateTime(act.date_end, act.end_time)}</div>
      </div>
    </div>

    <div class="detail-section-title">Lieu et type d'événement</div>
    <div class="detail-grid">
      <div>
        <div class="detail-row-label">Salle(s)</div>
        ${tagsOrDash(act.rooms)}
      </div>
      <div>
        <div class="detail-row-label">Type d'événement</div>
        <div class="detail-row-value">${eventTypeLabel}</div>
      </div>
      <div>
        <div class="detail-row-label">Responsable facturation</div>
        <div class="detail-row-value">${act.responsable || '-'}</div>
      </div>
      <div>
        <div class="detail-row-label">Département</div>
        <div class="detail-row-value">${act.department || '-'}</div>
      </div>
      ${act.description ? `
      <div class="detail-full-row">
        <div class="detail-row-label">Description</div>
        <div class="detail-row-value">${act.description}</div>
      </div>` : ""}
    </div>

    <div class="detail-section-title">Responsable de l'activité</div>
    <div class="detail-grid">
      <div>
        <div class="detail-row-label">Nom</div>
        <div class="detail-row-value">${managerName}</div>
      </div>
      <div>
        <div class="detail-row-label">Statut</div>
        <div class="detail-row-value">${managerTypeLabel}</div>
      </div>
      <div>
        <div class="detail-row-label">Téléphone</div>
        <div class="detail-row-value">${manager.phone || '-'}</div>
      </div>
      <div>
        <div class="detail-row-label">Courriel</div>
        <div class="detail-row-value">${manager.email || '-'}</div>
      </div>
    </div>

    <div class="detail-section-title">Services et options</div>
    <div class="detail-grid">
      <div>
        <div class="detail-row-label">Services techniques</div>
        ${tagsOrDash(act.technical_services)}
      </div>
      <div>
        <div class="detail-row-label">Service d'hôtes.ses</div>
        ${tagsOrDash(act.host_services)}
      </div>
      <div class="detail-full-row">
        <div class="detail-row-label">Consommation</div>
        ${tagsOrDash(act.consumption)}
        ${act.consumption_special_products ? `<div class="detail-row-value" style="margin-top: 6px;">Produits : ${act.consumption_special_products}</div>` : ""}
      </div>
      <div>
        <div class="detail-row-label">Temps Rémi</div>
        <div class="detail-row-value">${act.remi_hours || 0} h</div>
      </div>
    </div>

    <div class="detail-section-title">Ventilation par compte de revenus</div>
    ${distRows ? `
      <table class="detail-dist-table">
        <thead>
          <tr>
            <th>Compte</th>
            <th>Description</th>
            <th>RI / Facture</th>
            <th class="text-right">Montant</th>
          </tr>
        </thead>
        <tbody>${distRows}</tbody>
        <tfoot>
          <tr>
            <td colspan="3">Total</td>
            <td class="text-right">${formatCurrency(totalRev)}</td>
          </tr>
        </tfoot>
      </table>
    ` : `<div class="detail-row-value">Aucune ventilation saisie.</div>`}
  `;
}


/* ==========================================================================
   3. RECONCILIATION & VALIDATION CONTROLLER
   ========================================================================== */

function initReconciliationHandlers() {
  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("ledger-file-input");
  
  // Click dropzone triggers file picker
  dropZone.addEventListener("click", () => fileInput.click());
  
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) handleLedgerFile(file);
  });
  
  // Drag & drop events
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });
  
  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
  });
  
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (file) handleLedgerFile(file);
  });
  
  // Clear file import
  document.getElementById("clear-ledger-btn").addEventListener("click", () => {
    ledgerTransactions = [];
    reconciliationResults = [];
    document.getElementById("reconciliation-panel").style.display = "none";
    document.getElementById("drop-zone").style.display = "flex";
    document.getElementById("ledger-file-input").value = "";
  });
  
  // Recon filter tabs
  document.querySelectorAll(".reconcile-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".reconcile-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentReconFilter = tab.getAttribute("data-recon-filter");
      reconciliationPage = 1;
      renderReconciliationTable();
    });
  });
  
  // Close details modal
  document.getElementById("recon-detail-modal-close").addEventListener("click", closeReconDetailModal);
  document.getElementById("recon-detail-modal-close-btn").addEventListener("click", closeReconDetailModal);
  document.getElementById("modal-backdrop").addEventListener("click", closeReconDetailModal);
}

// Read ledger spreadsheet via SheetJS
function handleLedgerFile(file) {
  const reader = new FileReader();
  
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheet];
      const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
      
      // Map columns based on French ledger format
      // Standard headers: Poste budgétaire, Description, Période, Date versée, Tr. type, Nom, No référence, Montant courant, etc.
      // Clean and validate rows: must be actual ledger entries
      ledgerTransactions = rawRows.filter(row => {
        const poste = String(row["Poste budgétaire"] || "").trim();
        const dateVersee = String(row["Date versée"] || "").trim();
        const montant = parseFloat(row["Montant courant"]);
        
        return (
          poste !== "" &&
          poste !== "Total" &&
          dateVersee !== "" &&
          dateVersee !== "Total" &&
          dateVersee !== "Grand Total" &&
          !isNaN(montant)
        );
      });
      
      if (ledgerTransactions.length === 0) {
        alert("Aucune transaction valide n'a été trouvée dans le fichier. Veuillez vérifier la structure du fichier Excel.");
        return;
      }
      
      // Perform reconciliation
      reconcileLedger();
      
      // Show results panels
      document.getElementById("drop-zone").style.display = "none";
      document.getElementById("reconciliation-panel").style.display = "grid";
      
      renderReconciliation();
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la lecture du fichier : " + err.message);
    }
  };
  
  reader.readAsArrayBuffer(file);
}

// Reconciliation Engine Algorithm
function reconcileLedger() {
  reconciliationResults = [];
  
  // Format reference key
  function cleanRef(val) {
    if (val === undefined || val === null) return "";
    let s = String(val).trim().toUpperCase();
    if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
    return s;
  }
  
  // 1. Group ledger transactions by Account & Clean Reference
  const ledgerGroups = {};
  
  ledgerTransactions.forEach(tx => {
    // Period filter: Check transaction date against selected year and quarters
    const txDateStr = String(tx["Date versée"] || "").trim();
    const txYear = getFiscalYear(txDateStr);
    const txQuarter = getQuarterNumber(txDateStr);
    
    if (txYear !== appState.selected_year || !appState.selected_quarters.includes(txQuarter)) {
      return; // Skip transaction outside selected period
    }

    const acc = String(tx["Poste budgétaire"] || "").trim();
    
    // The reference can be in "No référence" (typically 6-digit numeric) or "Nom" (e.g. RIXXXXXX)
    const refNo = cleanRef(tx["No référence"]);
    const refNom = cleanRef(tx["Nom"]); // Originally removed, but might contain RIXXXXXX in real usage
    
    // Choose reference key: Prefer RI code in Nom, fallback to No référence
    let refKey = refNo;
    if (refNom.startsWith("RI")) {
      refKey = refNom;
    }
    
    if (!refKey) return; // Ignore ledger items without reference keys
    
    const key = `${acc}||${refKey}`;
    
    if (!ledgerGroups[key]) {
      ledgerGroups[key] = {
        account_code: acc,
        reference: refKey,
        montant_somme: 0.0,
        txs: []
      };
    }
    
    ledgerGroups[key].montant_somme += parseFloat(tx["Montant courant"]) || 0;
    ledgerGroups[key].txs.push(tx);
  });
  
  // Set tracking variable to see which ledger groups have been matched
  const matchedKeys = new Set();
  
  // 2. Loop through all activities in app database
  appState.activities.forEach(act => {
    if (act.name.trim() === "") return; // Skip blank activities
    
    // Period filter
    const actYear = getFiscalYear(act.date_start);
    const actQuarter = getQuarterNumber(act.date_start);
    if (actYear !== appState.selected_year || !appState.selected_quarters.includes(actQuarter)) {
      return; // Skip activity outside selected period
    }
    
    // Check reconciliation for each distribution (reference is now defined per account)
    act.distributions.forEach(dist => {
      const distRef = cleanRef(dist.reference);

      if (!distRef) {
        // Distribution without a reference: marked as "unlogged"
        reconciliationResults.push({
          activityId: act.id,
          activityName: act.name,
          account_code: dist.account_code,
          reference: "",
          amount_saisi: dist.amount,
          amount_gl: 0,
          status: "unlogged"
        });
        return;
      }

      // Find matching ledger group key
      const key = `${dist.account_code}||${distRef}`;
      const group = ledgerGroups[key];

      if (group) {
        matchedKeys.add(key);
        // Revenue in ledger is negative, so sum * -1 = positive revenue
        const expectedRevenue = group.montant_somme * -1;
        const diff = dist.amount - expectedRevenue;
        const isMatch = Math.abs(diff) < 0.02;

        reconciliationResults.push({
          activityId: act.id,
          activityName: act.name,
          account_code: dist.account_code,
          reference: distRef,
          amount_saisi: dist.amount,
          amount_gl: expectedRevenue,
          status: isMatch ? "valid" : "diff",
          diff: diff,
          ledgerTxs: group.txs
        });
      } else {
        // Logged in app, but not found in ledger
        reconciliationResults.push({
          activityId: act.id,
          activityName: act.name,
          account_code: dist.account_code,
          reference: distRef,
          amount_saisi: dist.amount,
          amount_gl: 0,
          status: "unlogged",
          diff: dist.amount
        });
      }
    });
  });
  
  // 3. Find ledger groups not matched to any activity distribution
  Object.keys(ledgerGroups).forEach(key => {
    if (!matchedKeys.has(key)) {
      const group = ledgerGroups[key];
      // Revenue is credit (negative in GL), multiply by -1
      const amountGl = group.montant_somme * -1;
      
      reconciliationResults.push({
        activityId: "",
        activityName: "(Non saisi dans l'application)",
        account_code: group.account_code,
        reference: group.reference,
        amount_saisi: 0,
        amount_gl: amountGl,
        status: "unentered",
        diff: -amountGl,
        ledgerTxs: group.txs
      });
    }
  });
}

function renderReconciliation() {
  if (reconciliationResults.length === 0) return;
  
  // Count stats
  const valid = reconciliationResults.filter(r => r.status === "valid").length;
  const diff = reconciliationResults.filter(r => r.status === "diff").length;
  const unlogged = reconciliationResults.filter(r => r.status === "unlogged").length;
  const unentered = reconciliationResults.filter(r => r.status === "unentered").length;
  
  document.getElementById("recon-stat-valid").textContent = valid;
  document.getElementById("recon-stat-diff").textContent = diff;
  document.getElementById("recon-stat-unlogged").textContent = unlogged;
  document.getElementById("recon-stat-unentered").textContent = unentered;
  
  document.getElementById("count-recon-all").textContent = reconciliationResults.length;
  document.getElementById("count-recon-valid").textContent = valid;
  document.getElementById("count-recon-diff").textContent = diff;
  document.getElementById("count-recon-unlogged").textContent = unlogged;
  document.getElementById("count-recon-unentered").textContent = unentered;
  
  renderReconciliationTable();
}

function renderReconciliationTable() {
  saveUiState();
  const tbody = document.getElementById("reconciliation-table-body");
  tbody.innerHTML = "";
  
  const filtered = reconciliationResults.filter(r => {
    if (currentReconFilter === "all") return true;
    return r.status === currentReconFilter;
  });
  
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="color: var(--text-muted); padding: 32px;">Aucun enregistrement dans cette catégorie.</td></tr>`;
    renderPaginationBar(document.getElementById("reconciliation-pagination"), { page: reconciliationPage, pageSize: reconciliationPageSize, totalItems: 0, onPageChange: () => {}, onPageSizeChange: () => {} });
    return;
  }

  reconciliationPage = renderPaginationBar(document.getElementById("reconciliation-pagination"), {
    page: reconciliationPage,
    pageSize: reconciliationPageSize,
    totalItems: filtered.length,
    onPageChange: (p) => { reconciliationPage = p; renderReconciliationTable(); },
    onPageSizeChange: (s) => { reconciliationPageSize = s; reconciliationPage = 1; renderReconciliationTable(); }
  });
  const startIdx = (reconciliationPage - 1) * reconciliationPageSize;
  const pageItems = filtered.slice(startIdx, startIdx + reconciliationPageSize);

  pageItems.forEach((r, localIdx) => {
    const idx = startIdx + localIdx;
    // Badges definitions
    const badgeHtml = {
      valid: `<span class="badge badge-success">Conforme</span>`,
      diff: `<span class="badge badge-danger">Écart de montant</span>`,
      unlogged: `<span class="badge badge-warning">Manquant dans le GL</span>`,
      unentered: `<span class="badge badge-info">Manquant dans l'App</span>`
    }[r.status];
    
    // Diff column text
    let diffText = "-";
    if (r.status === "diff") {
      const sign = r.diff > 0 ? "+" : "";
      diffText = `<span class="text-danger bold">${sign}${formatCurrency(r.diff)}</span>`;
    } else if (r.status === "unlogged") {
      diffText = `<span class="text-warning bold">+${formatCurrency(r.amount_saisi)}</span>`;
    } else if (r.status === "unentered") {
      diffText = `<span class="text-info bold">-${formatCurrency(r.amount_gl)}</span>`;
    }
    
    // Action buttons based on status
    let actionBtn = "";
    if (r.status === "unentered") {
      // Ledger row has transaction but missing in application. Provide "+" button to quickly log it
      actionBtn = `
        <button class="btn btn-secondary quick-add-ledger-btn" data-idx="${idx}" style="padding: 6px 12px; font-size: 0.8rem;" title="Enregistrer l'activité">
          + Créer activité
        </button>
      `;
    } else if (r.ledgerTxs && r.ledgerTxs.length > 0) {
      // Provide Details magnifying glass button to see lines
      actionBtn = `
        <button class="btn btn-secondary view-recon-lines-btn" data-idx="${idx}" style="padding: 6px 12px; font-size: 0.8rem;">
          Détails GL
        </button>
      `;
    }
    
    const accountDesc = appState.settings.accounts.find(a => a.code === r.account_code)?.description || "Inconnu";
    
    tbody.innerHTML += `
      <tr>
        <td>
          <div class="bold font-mono">${r.account_code}</div>
          <div style="font-size: 0.8rem; color: var(--text-secondary);">${accountDesc}</div>
          <div style="font-size: 0.78rem; font-style: italic; color: var(--text-muted); margin-top: 4px;">
            ${r.activityId ? `${r.activityId} : ${r.activityName}` : r.activityName}
          </div>
        </td>
        <td class="font-mono">${r.reference || '-'}</td>
        <td class="bold">${r.amount_saisi > 0 ? formatCurrency(r.amount_saisi) : '-'}</td>
        <td class="bold">${r.amount_gl > 0 ? formatCurrency(r.amount_gl) : '-'}</td>
        <td>${diffText}</td>
        <td>${badgeHtml}</td>
        <td class="text-right">${actionBtn}</td>
      </tr>
    `;
  });
  
  // Attach quick add buttons
  document.querySelectorAll(".quick-add-ledger-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const matchIdx = parseInt(btn.getAttribute("data-idx"));
      const r = filtered[matchIdx];
      
      // Auto-prepopulate activity form
      openActivityDrawer();
      
      // Assign pre-filled fields
      document.getElementById("form-activity-name").value = `Ajustement GL - Réf ${r.reference}`;

      // Clear blank default distribution row and write this one
      document.getElementById("form-distribution-list").innerHTML = "";
      addDistributionRow(r.account_code, r.amount_gl, r.reference);
    });
  });
  
  // Attach details lines viewer buttons
  document.querySelectorAll(".view-recon-lines-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const matchIdx = parseInt(btn.getAttribute("data-idx"));
      const r = filtered[matchIdx];
      openReconDetailModal(r);
    });
  });
}

function openReconDetailModal(reconRecord) {
  const modal = document.getElementById("recon-detail-modal");
  const backdrop = document.getElementById("modal-backdrop");
  
  document.getElementById("recon-detail-account").textContent = `${reconRecord.account_code} (${appState.settings.accounts.find(a => a.code === reconRecord.account_code)?.description || 'Inconnu'})`;
  document.getElementById("recon-detail-ref").textContent = reconRecord.reference;
  
  const tbody = document.getElementById("recon-detail-table-body");
  tbody.innerHTML = "";
  
  reconRecord.ledgerTxs.forEach(tx => {
    tbody.innerHTML += `
      <tr>
        <td class="font-mono" style="white-space: nowrap;">${tx["Date versée"] || '-'}</td>
        <td>${tx["Auxiliaire"] || '-'}</td>
        <td style="font-size: 0.82rem;">${tx["Description"] || '-'}</td>
        <td>${tx["Tr. type"] || '-'}</td>
        <td class="font-mono">${tx["No doc. GL"] || '-'}</td>
        <td class="text-right bold font-mono">${formatCurrency(parseFloat(tx["Montant courant"]))}</td>
      </tr>
    `;
  });
  
  modal.classList.add("active");
  backdrop.classList.add("active");
}

function closeReconDetailModal() {
  document.getElementById("recon-detail-modal").classList.remove("active");
  document.getElementById("modal-backdrop").classList.remove("active");
}


/* ==========================================================================
   4. SETTINGS VIEW CONTROLLER (CRUD CONFIGURATION)
   ========================================================================== */

function initSettingsHandlers() {
  // Settings panels switcher
  document.querySelectorAll(".settings-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".settings-tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      
      const panel = btn.getAttribute("data-settings-panel");
      document.querySelectorAll(".settings-panel").forEach(p => p.classList.remove("active"));
      document.getElementById(`panel-${panel}`).classList.add("active");
    });
  });
  
  // Modals close buttons
  document.getElementById("account-modal-close").addEventListener("click", () => closeSettingsModal("account"));
  document.getElementById("account-modal-cancel").addEventListener("click", () => closeSettingsModal("account"));
  document.getElementById("room-modal-close").addEventListener("click", () => closeSettingsModal("room"));
  document.getElementById("room-modal-cancel").addEventListener("click", () => closeSettingsModal("room"));
  document.getElementById("dept-modal-close").addEventListener("click", () => closeSettingsModal("dept"));
  document.getElementById("dept-modal-cancel").addEventListener("click", () => closeSettingsModal("dept"));
  
  // Accounts CRUD modal launch
  document.getElementById("add-account-btn").addEventListener("click", () => openAccountModal());
  document.getElementById("account-modal-submit").addEventListener("click", submitAccountForm);
  
  // Rooms CRUD modal launch
  document.getElementById("add-room-btn").addEventListener("click", () => openRoomModal());
  document.getElementById("room-modal-submit").addEventListener("click", submitRoomForm);
  
  // Departments CRUD modal launch
  document.getElementById("add-dept-btn").addEventListener("click", () => openDeptModal());
  document.getElementById("dept-modal-submit").addEventListener("click", submitDeptForm);
}

function renderSettings() {
  renderAccountsList();
  renderRoomsList();
  renderDepartmentsList();
}

function closeSettingsModal(type) {
  document.getElementById(`${type}-modal`).classList.remove("active");
  document.getElementById("modal-backdrop").classList.remove("active");
}

function openSettingsModal(type) {
  document.getElementById(`${type}-modal`).classList.add("active");
  document.getElementById("modal-backdrop").classList.add("active");
}

// 4.1 Accounts settings
function renderAccountsList() {
  const container = document.getElementById("settings-accounts-list");
  container.innerHTML = "";
  
  appState.settings.accounts.forEach(acc => {
    container.innerHTML += `
      <div class="settings-list-item">
        <div class="settings-list-item-info">
          <span class="settings-list-item-code">${acc.code}</span>
          <span class="settings-list-item-desc">${acc.description}</span>
        </div>
        <div class="flex gap-2">
          <button class="btn-icon edit-acc-btn" data-code="${acc.code}" title="Modifier">
            <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>
          <button class="btn-icon delete-acc-btn" data-code="${acc.code}" title="Supprimer" style="color: var(--danger);">
            <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
      </div>
    `;
  });
  
  // Attach listeners
  document.querySelectorAll(".edit-acc-btn").forEach(btn => {
    btn.addEventListener("click", () => openAccountModal(btn.getAttribute("data-code")));
  });
  document.querySelectorAll(".delete-acc-btn").forEach(btn => {
    btn.addEventListener("click", () => deleteAccount(btn.getAttribute("data-code")));
  });
}

function openAccountModal(code = null) {
  const form = document.getElementById("account-form");
  const title = document.getElementById("account-modal-title");
  form.reset();
  
  if (code) {
    title.textContent = "Modifier le compte GL";
    const acc = appState.settings.accounts.find(a => a.code === code);
    if (acc) {
      document.getElementById("form-account-original-code").value = acc.code;
      document.getElementById("form-account-code").value = acc.code;
      document.getElementById("form-account-desc").value = acc.description;
    }
  } else {
    title.textContent = "Ajouter un compte GL";
    document.getElementById("form-account-original-code").value = "";
  }
  openSettingsModal("account");
}

function submitAccountForm(e) {
  e.preventDefault();
  const originalCode = document.getElementById("form-account-original-code").value;
  const newCode = document.getElementById("form-account-code").value.trim();
  const desc = document.getElementById("form-account-desc").value.trim();
  
  if (!newCode.match(/^\d{3}-\d{4}-\d{2}-\d{3}$/)) {
    alert("Le code du compte doit respecter le format XXX-XXXX-XX-XXX (ex: 892-9020-00-849).");
    return;
  }
  
  if (!desc) {
    alert("Veuillez saisir un libellé.");
    return;
  }
  
  const payload = { code: newCode, description: desc };
  
  if (originalCode) {
    // Edit Mode
    const idx = appState.settings.accounts.findIndex(a => a.code === originalCode);
    if (idx !== -1) {
      appState.settings.accounts[idx] = payload;
      
      // Update existing activity distributions that used this code!
      appState.activities.forEach(act => {
        act.distributions.forEach(dist => {
          if (dist.account_code === originalCode) dist.account_code = newCode;
        });
      });
    }
  } else {
    // New Mode: Check duplicate code
    if (appState.settings.accounts.some(a => a.code === newCode)) {
      alert("Ce code de compte existe déjà.");
      return;
    }
    appState.settings.accounts.push(payload);
  }
  
  // Sort accounts by code
  appState.settings.accounts.sort((a, b) => a.code.localeCompare(b.code));
  
  saveDatabase();
  closeSettingsModal("account");
  populateDropdowns();
  renderSettings();
}

function deleteAccount(code) {
  if (confirm(`Voulez-vous vraiment supprimer le compte ${code} ? Les ventilations liées à ce compte seront effacées.`)) {
    appState.settings.accounts = appState.settings.accounts.filter(a => a.code !== code);
    
    // Remove account from all activity distributions
    appState.activities.forEach(act => {
      act.distributions = act.distributions.filter(d => d.account_code !== code);
    });
    
    saveDatabase();
    populateDropdowns();
    renderSettings();
  }
}

// 4.2 Rooms settings
function renderRoomsList() {
  const container = document.getElementById("settings-rooms-list");
  container.innerHTML = "";
  
  appState.settings.rooms.forEach(r => {
    container.innerHTML += `
      <div class="settings-list-item">
        <div class="settings-list-item-info">
          <span class="settings-list-item-code">${r.name}</span>
          <span class="settings-list-item-desc">Tarif Interne: ${r.price_internal}$/jour | Tarif Externe: ${r.price_external ? `${r.price_external}$/jour` : 'N/A'}</span>
        </div>
        <div class="flex gap-2">
          <button class="btn-icon edit-room-btn" data-name="${r.name}" title="Modifier">
            <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>
          <button class="btn-icon delete-room-btn" data-name="${r.name}" title="Supprimer" style="color: var(--danger);">
            <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
      </div>
    `;
  });
  
  // Attach listeners
  document.querySelectorAll(".edit-room-btn").forEach(btn => {
    btn.addEventListener("click", () => openRoomModal(btn.getAttribute("data-name")));
  });
  document.querySelectorAll(".delete-room-btn").forEach(btn => {
    btn.addEventListener("click", () => deleteRoom(btn.getAttribute("data-name")));
  });
}

function openRoomModal(name = null) {
  const form = document.getElementById("room-form");
  const title = document.getElementById("room-modal-title");
  form.reset();
  
  if (name) {
    title.textContent = "Modifier la salle";
    const r = appState.settings.rooms.find(room => room.name === name);
    if (r) {
      document.getElementById("form-room-original-name").value = r.name;
      document.getElementById("form-room-name").value = r.name;
      document.getElementById("form-room-price-int").value = r.price_internal;
      document.getElementById("form-room-price-ext").value = r.price_external || "";
    }
  } else {
    title.textContent = "Ajouter une salle";
    document.getElementById("form-room-original-name").value = "";
  }
  openSettingsModal("room");
}

function submitRoomForm(e) {
  e.preventDefault();
  const originalName = document.getElementById("form-room-original-name").value;
  const newName = document.getElementById("form-room-name").value.trim().toUpperCase();
  const priceInt = parseFloat(document.getElementById("form-room-price-int").value) || 0;
  const priceExt = parseFloat(document.getElementById("form-room-price-ext").value) || 0;
  
  if (!newName) {
    alert("Le nom de la salle est obligatoire.");
    return;
  }
  
  const payload = { name: newName, price_internal: priceInt, price_external: priceExt };
  
  if (originalName) {
    const idx = appState.settings.rooms.findIndex(r => r.name === originalName);
    if (idx !== -1) {
      appState.settings.rooms[idx] = payload;
      
      // Update existing activities room name reference!
      appState.activities.forEach(act => {
        act.rooms = (act.rooms || []).map(r => r === originalName ? newName : r);
      });
    }
  } else {
    if (appState.settings.rooms.some(r => r.name === newName)) {
      alert("Cette salle existe déjà.");
      return;
    }
    appState.settings.rooms.push(payload);
  }
  
  saveDatabase();
  closeSettingsModal("room");
  populateDropdowns();
  renderSettings();
}

function deleteRoom(name) {
  if (confirm(`Voulez-vous vraiment supprimer la salle ${name} ?`)) {
    appState.settings.rooms = appState.settings.rooms.filter(r => r.name !== name);
    saveDatabase();
    populateDropdowns();
    renderSettings();
  }
}

// 4.3 Departments settings
function renderDepartmentsList() {
  const container = document.getElementById("settings-depts-list");
  container.innerHTML = "";
  
  appState.settings.departments.forEach(dept => {
    container.innerHTML += `
      <div class="settings-list-item">
        <div class="settings-list-item-info">
          <span class="settings-list-item-code" style="font-family: inherit;">${dept}</span>
        </div>
        <div class="flex gap-2">
          <button class="btn-icon edit-dept-btn" data-name="${dept}" title="Modifier">
            <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>
          <button class="btn-icon delete-dept-btn" data-name="${dept}" title="Supprimer" style="color: var(--danger);">
            <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
      </div>
    `;
  });

  // Attach listeners
  document.querySelectorAll(".edit-dept-btn").forEach(btn => {
    btn.addEventListener("click", () => openDeptModal(btn.getAttribute("data-name")));
  });
  document.querySelectorAll(".delete-dept-btn").forEach(btn => {
    btn.addEventListener("click", () => deleteDept(btn.getAttribute("data-name")));
  });
}

function openDeptModal(name = null) {
  const form = document.getElementById("dept-form");
  const title = document.getElementById("dept-modal-title");
  form.reset();

  if (name) {
    title.textContent = "Modifier le département";
    document.getElementById("form-dept-original-name").value = name;
    document.getElementById("form-dept-name").value = name;
  } else {
    title.textContent = "Ajouter un département";
    document.getElementById("form-dept-original-name").value = "";
  }
  openSettingsModal("dept");
}

function submitDeptForm(e) {
  e.preventDefault();
  const originalName = document.getElementById("form-dept-original-name").value;
  const name = document.getElementById("form-dept-name").value.trim();

  if (!name) {
    alert("Le nom du département est obligatoire.");
    return;
  }

  const duplicate = appState.settings.departments.some(d =>
    d.toUpperCase() === name.toUpperCase() && d.toUpperCase() !== originalName.toUpperCase()
  );
  if (duplicate) {
    alert("Ce département existe déjà.");
    return;
  }

  if (originalName) {
    const idx = appState.settings.departments.findIndex(d => d === originalName);
    if (idx !== -1) {
      appState.settings.departments[idx] = name;

      // Update existing activities referencing the old department name
      appState.activities.forEach(act => {
        if (act.department === originalName) {
          act.department = name;
        }
      });
    }
  } else {
    appState.settings.departments.push(name);
  }

  appState.settings.departments.sort();

  saveDatabase();
  closeSettingsModal("dept");
  populateDropdowns();
  renderSettings();
}

function deleteDept(name) {
  if (confirm(`Voulez-vous vraiment supprimer le département "${name}" ?`)) {
    appState.settings.departments = appState.settings.departments.filter(d => d !== name);
    saveDatabase();
    populateDropdowns();
    renderSettings();
  }
}


/* ==========================================================================
   5. BACKUP & EXPORT/IMPORT CONTROLLERS
   ========================================================================== */

function initBackupHandlers() {
  // Export JSON Backup
  document.getElementById("backup-export-json").addEventListener("click", () => {
    // Update last backup date to today before export
    appState.settings.last_backup_date = new Date().toISOString().split('T')[0];
    saveDatabase();
    
    // Refresh banner and backup view
    checkBackupReminder();
    renderBackupView();

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    
    const timestamp = new Date().toISOString().split('T')[0];
    dlAnchorElem.setAttribute("download", `compta_marie_sauvegarde_${timestamp}.json`);
    dlAnchorElem.click();
  });
  
  // Backup file selection drag & drop
  const jsonDropZone = document.getElementById("json-drop-zone");
  const jsonFileInput = document.getElementById("json-file-input");
  
  jsonDropZone.addEventListener("click", () => jsonFileInput.click());
  
  jsonFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) handleJsonBackupFile(file);
  });
  
  // Export Excel
  document.getElementById("backup-export-excel").addEventListener("click", () => {
    exportToExcel();
  });
  
  // Reset database button
  document.getElementById("backup-reset-db").addEventListener("click", () => {
    if (confirm("ATTENTION : Cette action va supprimer définitivement toutes vos activités enregistrées. Les comptes, tarifs de salles et départements seront réinitialisés à leurs valeurs d'origine. Voulez-vous continuer ?")) {
      seedDatabase();
      applyTheme("dark");
      renderAll();
      checkBackupReminder();
      alert("La base de données a été réinitialisée avec succès !");
    }
  });

  // Reminder days input event handler
  const reminderInput = document.getElementById("backup-reminder-days-input");
  if (reminderInput) {
    reminderInput.addEventListener("change", (e) => {
      let val = parseInt(e.target.value, 10);
      if (isNaN(val) || val < 1) {
        val = 7;
        e.target.value = 7;
      }
      appState.settings.backup_reminder_days = val;
      saveDatabase();
      checkBackupReminder();
      renderBackupView();
    });
  }

  // Backup banner action redirect
  const bannerActionBtn = document.getElementById("backup-banner-action-btn");
  if (bannerActionBtn) {
    bannerActionBtn.addEventListener("click", () => {
      switchToView("backup");
    });
  }
}

function handleJsonBackupFile(file) {
  const reader = new FileReader();
  
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed.settings && parsed.activities) {
        if (confirm("La restauration va écraser la base de données actuelle. Continuer ?")) {
          appState = parsed;
          
          // Sanitize settings on restoration
          if (!appState.settings) appState.settings = {};
          if (appState.settings.last_backup_date === undefined) appState.settings.last_backup_date = "";
          appState.settings.backup_reminder_days = parseInt(appState.settings.backup_reminder_days, 10);
          if (isNaN(appState.settings.backup_reminder_days)) {
            appState.settings.backup_reminder_days = 7;
          }

          // Sort accounts on restoration
          if (appState.settings && appState.settings.accounts) {
            appState.settings.accounts.sort((a, b) => a.code.localeCompare(b.code));
          }
          saveDatabase();
          applyTheme(appState.settings.theme || "dark");
          renderAll();
          checkBackupReminder();
          alert("Base de données restaurée avec succès !");
        }
      } else {
        alert("Fichier de sauvegarde invalide (champs requis manquants).");
      }
    } catch (err) {
      alert("Erreur lors de la lecture du fichier JSON : " + err.message);
    }
  };
  
  reader.readAsText(file);
}

// Backup reminder helpers and views
function getDaysSinceLastBackup() {
  if (!appState.settings.last_backup_date) {
    return null;
  }
  const parts = appState.settings.last_backup_date.split('-');
  if (parts.length !== 3) return null;
  
  const lastBackupDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  const today = new Date();
  
  // Set both to midnight local time
  lastBackupDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  
  const diffMs = today.getTime() - lastBackupDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffDays;
}

function formatLocalDateToFrench(dateStr) {
  if (!dateStr) return "Aucune sauvegarde effectuée";
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  
  const months = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre"
  ];
  
  return `${day} ${months[monthIdx]} ${year}`;
}

function checkBackupReminder() {
  const banner = document.getElementById("backup-reminder-banner");
  if (!banner) return;
  
  if (appState.activities.length === 0) {
    banner.style.display = "none";
    return;
  }
  
  const lastBackup = appState.settings.last_backup_date;
  const reminderDays = appState.settings.backup_reminder_days || 7;
  
  if (!lastBackup) {
    document.getElementById("backup-alert-text").innerHTML = `
      <svg viewBox="0 0 24 24" class="alert-icon" style="fill: var(--warning-text); margin-right: 8px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
      <span>Attention : Aucune sauvegarde de vos données n'a été effectuée.</span>
    `;
    banner.style.display = "flex";
  } else {
    const days = getDaysSinceLastBackup();
    if (days !== null && days >= reminderDays) {
      document.getElementById("backup-alert-text").innerHTML = `
        <svg viewBox="0 0 24 24" class="alert-icon" style="fill: var(--warning-text); margin-right: 8px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
        <span>Attention : Votre dernière sauvegarde remonte à <strong>${days}</strong> ${days > 1 ? 'jours' : 'jour'} (limite configurée à ${reminderDays} jours).</span>
      `;
      banner.style.display = "flex";
    } else {
      banner.style.display = "none";
    }
  }
}

function renderBackupView() {
  const lastBackup = appState.settings.last_backup_date;
  const reminderDays = appState.settings.backup_reminder_days || 7;
  
  // Update date text
  const dateEl = document.getElementById("backup-status-date");
  if (dateEl) {
    dateEl.textContent = lastBackup ? `${formatLocalDateToFrench(lastBackup)} (${lastBackup})` : "Aucune sauvegarde effectuée";
  }
  
  // Update status badge
  const badgeContainer = document.getElementById("backup-status-badge-container");
  if (badgeContainer) {
    if (appState.activities.length === 0) {
      badgeContainer.innerHTML = `<span class="badge badge-info">Aucune donnée à sauvegarder</span>`;
    } else if (!lastBackup) {
      badgeContainer.innerHTML = `<span class="badge badge-danger">Non sauvegardé</span>`;
    } else {
      const days = getDaysSinceLastBackup();
      if (days !== null && days >= reminderDays) {
        badgeContainer.innerHTML = `<span class="badge badge-warning">Sauvegarde requise</span>`;
      } else {
        badgeContainer.innerHTML = `<span class="badge badge-success">À jour</span>`;
      }
    }
  }
  
  // Update reminder input value
  const inputEl = document.getElementById("backup-reminder-days-input");
  if (inputEl) {
    inputEl.value = reminderDays;
  }
}


// Generate structured excel matching the original template
function exportToExcel() {
  // Helper to convert column index to letter
  function getExcelColName(colIdx) {
    let temp, letter = "";
    while (colIdx > 0) {
      temp = (colIdx - 1) % 26;
      letter = String.fromCharCode(65 + temp) + letter;
      colIdx = (colIdx - temp - 1) / 26;
    }
    return letter;
  }

  try {
    const wb = XLSX.utils.book_new();
    
    // Sheet 1: ACTIVITÉS
    // Define Headers
    const headers = [
      "NUMERO ACTIVITE",
      "RESPONSABLE FACTURATION",
      "NOM DE L'ACTIVITÉ",
      "DATE DÉBUT",
      "DATE FIN",
      "Nbre jour occupation (formule)",
      "Client interne ou externe",
      "CATÉGORIE (Rébecca)",
      "SALLE (menu déroulant)",
      "TEMPS RÉMI (en heure)",
      "DÉPARTEMENT (menu déroulant À VENIR)",
      "PRIX SALLE SANS FRAIS (formule) interne seulement",
      "NUMÉRO DE FACTURE, RÉQUISITION INTERNE OU ENCAISSEMENT"
    ];
    
    // Add all configured account codes as columns
    const accountsOrder = appState.settings.accounts.map(a => a.code);
    accountsOrder.forEach(code => {
      const label = appState.settings.accounts.find(a => a.code === code)?.description || "";
      headers.push(`${code}\n${label}`);
    });
    
    headers.push("REVENUS TOTAL RÉÈL");
    
    const sheetData = [headers];
    
    // Filter activities for active period
    const activeActivities = appState.activities.filter(act => {
      if (act.name.trim() === "") return false;
      const actYear = getFiscalYear(act.date_start);
      const actQuarter = getQuarterNumber(act.date_start);
      return (actYear === appState.selected_year) && appState.selected_quarters.includes(actQuarter);
    });
    
    // Add activities rows
    activeActivities.forEach((act, rIdx) => {
      const isFilled = act.name.trim() !== "";
      const row = [];
      
      row.push(act.id); // NUMERO ACTIVITE
      row.push(isFilled ? act.responsable : ""); // RESPONSABLE FACTURATION
      row.push(isFilled ? act.name : ""); // NOM DE L'ACTIVITÉ
      row.push(isFilled ? act.date_start : ""); // DATE DÉBUT
      row.push(isFilled ? act.date_end : ""); // DATE FIN
      
      // Nbre jour occupation (written as formula in row index rIdx + 2 since index 1 is headers)
      const excelRow = rIdx + 2;
      row.push({ t: 'n', f: `E${excelRow}-D${excelRow}+1` });
      
      row.push(isFilled ? act.client_type : ""); // Client interne ou externe
      row.push(isFilled ? (act.category || "") : ""); // CATÉGORIE (champ retiré du formulaire, conservé vide pour ne pas décaler les colonnes)
      row.push(isFilled ? (act.rooms || []).join(", ") : ""); // SALLE
      row.push(isFilled ? act.remi_hours : 0); // TEMPS RÉMI
      row.push(isFilled ? act.department : ""); // DÉPARTEMENT

      // PRIX SALLE SANS FRAIS (formule)
      // Calculated as Nbre jours * Price Internal if client is internal.
      // In excel we can write a formula that checks client type:
      // =IF(G2="interne", F2 * [price_internal], 0)
      const priceInternal = getRoomsInternalPrice(act);
      row.push({ t: 'n', f: `IF(G${excelRow}="interne", F${excelRow}*${priceInternal}, 0)` });
      
      row.push(isFilled ? getActivityReferences(act) : ""); // NUMÉRO DE FACTURE... (regroupé par compte)
      
      // Distribute amounts to matching account columns
      accountsOrder.forEach(code => {
        const dist = act.distributions.find(d => d.account_code === code);
        row.push(dist ? dist.amount : 0);
      });
      
      // REVENUS TOTAL RÉÈL (written as formula summing distributions)
      // distributions columns start at column index 13 (N) and end at headers.length - 2
      // Let's convert column indices to Excel column letters!
      
      const firstDistCol = getExcelColName(13 + 1); // 1-based index (N)
      const lastDistCol = getExcelColName(13 + accountsOrder.length); // End of accounts
      
      row.push({ t: 'n', f: `SUM(${firstDistCol}${excelRow}:${lastDistCol}${excelRow})` });
      
      sheetData.push(row);
    });
    
    // Add Total sum row at the bottom
    const totalRowIdx = sheetData.length + 1;
    const totalRow = new Array(13).fill("");
    totalRow[0] = "TOTAUX COMPLETS";
    
    // Sum formula for each accounts column and total column
    const startRow = 2;
    const endRow = totalRowIdx - 1;
    
    accountsOrder.forEach((code, aIdx) => {
      const colLetter = getExcelColName(13 + aIdx + 1);
      totalRow.push({ t: 'n', f: `SUM(${colLetter}${startRow}:${colLetter}${endRow})` });
    });
    
    const totalColLetter = getExcelColName(13 + accountsOrder.length + 1);
    totalRow.push({ t: 'n', f: `SUM(${totalColLetter}${startRow}:${totalColLetter}${endRow})` });
    
    sheetData.push(totalRow);
    
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    
    // Adjust columns widths
    ws['!cols'] = [
      { wch: 15 }, // ID
      { wch: 20 }, // Responsable
      { wch: 25 }, // Nom
      { wch: 12 }, // Date D
      { wch: 12 }, // Date F
      { wch: 10 }, // Jours
      { wch: 12 }, // Client type
      { wch: 10 }, // Catégorie
      { wch: 15 }, // Salle
      { wch: 10 }, // Rémi
      { wch: 22 }, // Département
      { wch: 15 }, // Sans frais
      { wch: 20 }  // Facture/RI
    ];
    
    // Push account columns sizes
    accountsOrder.forEach(() => ws['!cols'].push({ wch: 18 }));
    ws['!cols'].push({ wch: 20 }); // Total revenue
    
    XLSX.utils.book_append_sheet(wb, ws, "ACTIVITÉS");
    
    // Sheet 2: Configuration Salles
    const roomsData = [["SALLE", "PRIX INTERNE", "PRIX EXTERNE"]];
    appState.settings.rooms.forEach(r => {
      roomsData.push([r.name, r.price_internal, r.price_external]);
    });
    const wsRooms = XLSX.utils.aoa_to_sheet(roomsData);
    XLSX.utils.book_append_sheet(wb, wsRooms, "SALLES");
    
    // Trigger download: includes selected period in filename
    const qStr = appState.selected_quarters.sort().map(q => `T${q}`).join("-");
    const filename = `compta_marie_rapport_${appState.selected_year}_${qStr || 'aucun'}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
  } catch (err) {
    console.error(err);
    alert("Erreur lors de l'export Excel : " + err.message);
  }
}

/* ==========================================================================
   3.6 GRAND LIVRE LOCAL VIEW CONTROLLER
   ========================================================================== */

function renderAccountReport() {
  saveUiState();
  const container = document.getElementById("account-report-container");
  const filterAccount = document.getElementById("filter-report-account").value;
  
  container.innerHTML = "";
  
  // 1. Group activity distributions by account code
  // We want to map: accountCode -> array of { activity, distAmount }
  const accountEntries = {};
  
  // Initialize for all configured accounts
  appState.settings.accounts.forEach(acc => {
    accountEntries[acc.code] = [];
  });
  
  // Populate from activities
  appState.activities.forEach(act => {
    if (act.name.trim() === "") return; // Skip blank activities
    
    // Period filter
    const actYear = getFiscalYear(act.date_start);
    const actQuarter = getQuarterNumber(act.date_start);
    if (actYear !== appState.selected_year || !appState.selected_quarters.includes(actQuarter)) {
      return;
    }
    
    act.distributions.forEach(d => {
      if (accountEntries[d.account_code]) {
        accountEntries[d.account_code].push({
          activity: act,
          amount: d.amount,
          reference: d.reference
        });
      } else {
        // Fallback in case account code is not in configured settings list
        accountEntries[d.account_code] = [{
          activity: act,
          amount: d.amount,
          reference: d.reference
        }];
      }
    });
  });
  
  // Determine which accounts to render
  let accountsToRender = appState.settings.accounts;
  if (filterAccount) {
    accountsToRender = appState.settings.accounts.filter(a => a.code === filterAccount);
  }
  
  // If we show "All", let's only display accounts that have at least one transaction entry.
  // If the user selected a specific account, we display it even if it has no entries.
  if (!filterAccount) {
    accountsToRender = accountsToRender.filter(acc => accountEntries[acc.code] && accountEntries[acc.code].length > 0);
    
    if (accountsToRender.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 48px; color: var(--text-secondary); background-color: var(--bg-main); border-radius: var(--radius-lg); border: 1px dashed var(--border-color);">
          <h3>Aucune écriture comptable saisie</h3>
          <p style="margin-top: 8px; font-size: 0.9rem;">Veuillez saisir des activités et ventiler des montants dans l'onglet <strong>Activités</strong> pour générer les fiches de compte.</p>
        </div>
      `;
      return;
    }
  }
  
  // Render tables
  accountsToRender.forEach(acc => {
    const entries = accountEntries[acc.code] || [];
    const totalAcc = entries.reduce((sum, e) => sum + e.amount, 0);

    // Sort entries according to the current account report sort state
    entries.sort((a, b) => {
      let valA = "";
      let valB = "";

      switch (accountReportSortKey) {
        case "id":
          valA = a.activity.id;
          valB = b.activity.id;
          break;
        case "name":
          valA = a.activity.name.toLowerCase();
          valB = b.activity.name.toLowerCase();
          break;
        case "date_start":
          valA = a.activity.date_start || "";
          valB = b.activity.date_start || "";
          break;
        case "department":
          valA = (a.activity.department || "").toLowerCase();
          valB = (b.activity.department || "").toLowerCase();
          break;
        case "reference":
          valA = (a.reference || "").toLowerCase();
          valB = (b.reference || "").toLowerCase();
          break;
        case "amount":
          valA = a.amount;
          valB = b.amount;
          break;
      }

      if (typeof valA === "string" && typeof valB === "string") {
        return accountReportSortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else {
        return accountReportSortOrder === "asc" ? valA - valB : valB - valA;
      }
    });

    // Paginate this account's entries independently from the other fiches
    const accountPage = accountReportPages[acc.code] || 1;
    const totalPages = Math.max(1, Math.ceil(entries.length / accountReportPageSize));
    const clampedAccountPage = Math.min(Math.max(1, accountPage), totalPages);
    const pageStartIdx = (clampedAccountPage - 1) * accountReportPageSize;
    const pageEntries = entries.slice(pageStartIdx, pageStartIdx + accountReportPageSize);

    let tableRowsHtml = "";
    if (entries.length === 0) {
      tableRowsHtml = `
        <tr>
          <td colspan="6" class="text-center" style="color: var(--text-muted); padding: 24px;">
            Aucune écriture enregistrée pour ce compte.
          </td>
        </tr>
      `;
    } else {
      pageEntries.forEach(e => {
        const act = e.activity;
        let datesText = "-";
        if (act.date_start && act.date_end) {
          const start = new Date(act.date_start).toLocaleDateString('fr-CA', {month: 'short', day: 'numeric'});
          const end = new Date(act.date_end).toLocaleDateString('fr-CA', {month: 'short', day: 'numeric'});
          datesText = `${start} au ${end}`;
        }
        
        tableRowsHtml += `
          <tr>
            <td class="font-mono bold">${act.id}</td>
            <td>${act.name}</td>
            <td>${datesText}</td>
            <td>${act.department}</td>
            <td class="font-mono">${e.reference || '-'}</td>
            <td class="bold text-right font-mono" style="color: var(--success-text);">${formatCurrency(e.amount)}</td>
          </tr>
        `;
      });
    }
    
    container.innerHTML += `
      <div class="stat-card" style="padding: 0; display: flex; flex-direction: column; gap: 0;">
        <div style="padding: 16px 24px; border-bottom: 1px solid var(--border-color); background-color: var(--primary-light); display: flex; justify-content: space-between; align-items: center; border-radius: var(--radius-lg) var(--radius-lg) 0 0;">
          <div>
            <span class="font-mono bold" style="font-size: 1.05rem; color: var(--primary);">${acc.code}</span>
            <span class="bold" style="margin-left: 12px; font-size: 0.95rem; color: var(--text-primary);">${acc.description}</span>
          </div>
          <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 500;">
            ${entries.length} écriture(s)
          </div>
        </div>
        
        <div class="table-responsive">
          <table style="width: 100%; border-collapse: separate; border-spacing: 0;">
            <thead>
              <tr style="background-color: var(--bg-main);">
                <th data-sort="id" class="${accountReportSortKey === 'id' ? (accountReportSortOrder === 'asc' ? 'sort-asc' : 'sort-desc') : ''}" style="padding: 12px 24px; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary);">N° Activité</th>
                <th data-sort="name" class="${accountReportSortKey === 'name' ? (accountReportSortOrder === 'asc' ? 'sort-asc' : 'sort-desc') : ''}" style="padding: 12px 24px; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary);">Nom de l'Activité</th>
                <th data-sort="date_start" class="${accountReportSortKey === 'date_start' ? (accountReportSortOrder === 'asc' ? 'sort-asc' : 'sort-desc') : ''}" style="padding: 12px 24px; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary);">Dates d'occupation</th>
                <th data-sort="department" class="${accountReportSortKey === 'department' ? (accountReportSortOrder === 'asc' ? 'sort-asc' : 'sort-desc') : ''}" style="padding: 12px 24px; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary);">Département</th>
                <th data-sort="reference" class="${accountReportSortKey === 'reference' ? (accountReportSortOrder === 'asc' ? 'sort-asc' : 'sort-desc') : ''}" style="padding: 12px 24px; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary);">RI / Facture Réf.</th>
                <th data-sort="amount" class="${accountReportSortKey === 'amount' ? (accountReportSortOrder === 'asc' ? 'sort-asc' : 'sort-desc') : ''}" style="padding: 12px 24px; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); text-align: right;">Montant</th>
              </tr>
            </thead>
            <tbody>
              ${tableRowsHtml}
              <tr style="background-color: var(--bg-main); border-top: 2px solid var(--border-color);">
                <td colspan="5" class="bold text-right" style="padding: 16px 24px; font-size: 0.92rem; text-transform: uppercase;">
                  Total pour le compte ${acc.code} :
                </td>
                <td class="bold text-right font-mono" style="padding: 16px 24px; font-size: 1.05rem; color: var(--primary);">
                  ${formatCurrency(totalAcc)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="pagination-bar">${
          entries.length > 0
            ? buildPaginationBarHtml({
                page: clampedAccountPage,
                pageSize: accountReportPageSize,
                totalItems: entries.length,
                extraAttr: `data-account="${acc.code}"`
              }).html
            : ""
        }</div>
      </div>
    `;
  });

  // Wire up sortable headers and pagination controls (delegated, since the
  // per-account cards are rebuilt via innerHTML += on every render, which
  // would otherwise tear down any directly-attached listeners)
  container.onclick = (e) => {
    const th = e.target.closest("th[data-sort]");
    if (th && container.contains(th)) {
      const sortKey = th.getAttribute("data-sort");
      if (accountReportSortKey === sortKey) {
        accountReportSortOrder = accountReportSortOrder === "asc" ? "desc" : "asc";
      } else {
        accountReportSortKey = sortKey;
        accountReportSortOrder = "asc";
      }
      renderAccountReport();
      return;
    }

    const pageBtn = e.target.closest(".pagination-prev, .pagination-next");
    if (pageBtn && container.contains(pageBtn)) {
      const code = pageBtn.getAttribute("data-account");
      const currentPage = accountReportPages[code] || 1;
      accountReportPages[code] = pageBtn.classList.contains("pagination-prev") ? currentPage - 1 : currentPage + 1;
      renderAccountReport();
    }
  };

  container.onchange = (e) => {
    const select = e.target.closest(".pagination-size-select");
    if (select && container.contains(select)) {
      accountReportPageSize = parseInt(select.value, 10);
      accountReportPages = {};
      renderAccountReport();
    }
  };
}

/* ==========================================================================
   5.5 PERIOD SELECTOR CONTROLLERS
   ========================================================================== */

// Sets which pills are marked active within a pill-toggle group, based on a list of values
function setPillGroupActive(containerId, activeValues) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll(".pill-toggle").forEach(btn => {
    btn.classList.toggle("active", activeValues.includes(btn.dataset.value));
  });
}

// Delegated click handler for a pill-toggle container (survives innerHTML rebuilds)
function initPillToggle(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".pill-toggle");
    if (!btn || !container.contains(btn)) return;

    btn.classList.toggle("active");

    const internalId = document.getElementById("form-activity-internal-id").value;
    if (!internalId) {
      isDraftDirty = true;
    }
  });
}

function initPeriodSelector() {
  // Populate dropdown
  populateFiscalYears();
  
  // Wire quarter buttons toggling
  document.querySelectorAll(".quarter-toggle").forEach(btn => {
    const q = parseInt(btn.getAttribute("data-q"));
    
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
      if (ledgerTransactions.length > 0) {
        reconcileLedger();
      }
      
      renderAll();
    });
  });
  
  // Wire year select
  const yearSelect = document.getElementById("top-fiscal-year");
  if (yearSelect) {
    yearSelect.addEventListener("change", (e) => {
      appState.selected_year = e.target.value;
      saveDatabase();
      
      // Re-run validation if ledger has been loaded to update statuses immediately!
      if (ledgerTransactions.length > 0) {
        reconcileLedger();
      }
      
      renderAll();
    });
  }
}

function populateFiscalYears() {
  const select = document.getElementById("top-fiscal-year");
  if (!select) return;
  
  // Base years
  const years = new Set(["2024-2025", "2025-2026", "2026-2027", "2027-2028", "2028-2029", "2029-2030"]);
  
  // Find any year from activities
  appState.activities.forEach(act => {
    if (act.date_start) {
      const fy = getFiscalYear(act.date_start);
      if (fy) years.add(fy);
    }
  });
  
  // Sort them
  const sortedYears = Array.from(years).sort();
  
  select.innerHTML = "";
  sortedYears.forEach(fy => {
    const isSelected = fy === appState.selected_year ? 'selected' : '';
    select.innerHTML += `<option value="${fy}" ${isSelected}>${fy}</option>`;
  });
}

function maskDateInput(input) {
  input.addEventListener("input", (e) => {
    // Let the user delete normally with backspace
    if (e.inputType === "deleteContentBackward") {
      return;
    }
    
    let value = input.value.replace(/\D/g, ""); // Keep only digits
    if (value.length > 8) {
      value = value.substring(0, 8);
    }
    
    let formatted = "";
    if (value.length > 0) {
      formatted += value.substring(0, 4); // YYYY
    }
    if (value.length > 4) {
      formatted += "-" + value.substring(4, 6); // -MM
    }
    if (value.length > 6) {
      formatted += "-" + value.substring(6, 8); // -DD
    }
    
    input.value = formatted;
  });
}

function maskPhoneInput(input) {
  if (!input) return;
  input.addEventListener("input", (e) => {
    // Let the user delete normally with backspace or delete key
    if (e.inputType === "deleteContentBackward" || e.inputType === "deleteContentForward") {
      return;
    }
    
    let value = input.value.replace(/\D/g, ""); // Keep only digits
    if (value.length > 10) {
      value = value.substring(0, 10);
    }
    
    let formatted = "";
    if (value.length > 0) {
      formatted += value.substring(0, 3); // XXX
    }
    if (value.length > 3) {
      formatted += "-" + value.substring(3, 6); // -XXX
    }
    if (value.length > 6) {
      formatted += "-" + value.substring(6, 10); // -XXXX
    }
    
    input.value = formatted;
  });
}

// Parses a "YYYY-MM-DD" string as a local date (avoids the UTC-midnight off-by-one
// that new Date("YYYY-MM-DD") causes in timezones behind UTC).
function parseLocalDateStr(dateStr) {
  if (!dateStr) return new Date(NaN);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return new Date(dateStr);
  return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
}

// Validates a date input's value against the active fiscal year and shows/hides
// the associated .field-error-msg (id: "<input-id>-fy-error") in real time.
function validateDateFieldFiscalYear(input) {
  const errorEl = document.getElementById(`${input.id}-fy-error`);
  if (!errorEl) return true;

  const value = input.value.trim();
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const fyRange = getFiscalYearRange(appState.selected_year);

  let message = "";
  if (value && dateRegex.test(value) && fyRange) {
    const d = parseLocalDateStr(value);
    const minDate = parseLocalDateStr(fyRange.start);
    const maxDate = parseLocalDateStr(fyRange.end);
    if (!isNaN(d.getTime()) && (d < minDate || d > maxDate)) {
      message = `Cette date doit être comprise dans l'année financière active (${appState.selected_year}).`;
    }
  }

  errorEl.textContent = message;
  errorEl.classList.toggle("visible", !!message);
  input.classList.toggle("invalid", !!message);
  return !message;
}

// Clears all fiscal-year date error messages/styling in the activity form (used on drawer open).
function clearDateFieldErrors() {
  document.querySelectorAll("#activity-form .field-error-msg").forEach(el => {
    el.textContent = "";
    el.classList.remove("visible");
  });
  document.querySelectorAll("#activity-form .form-input.invalid").forEach(el => {
    el.classList.remove("invalid");
  });
}

function initCustomDatepickers() {
  const wrappers = document.querySelectorAll(".datepicker-wrapper");

  wrappers.forEach(wrapper => {
    const input = wrapper.querySelector(".form-input");
    const btn = wrapper.querySelector(".datepicker-trigger-btn");
    const popover = wrapper.querySelector(".calendar-popover");

    // Auto-mask date formatting on keyboard input
    maskDateInput(input);

    // Real-time validation against the active fiscal year
    input.addEventListener("input", () => validateDateFieldFiscalYear(input));
    input.addEventListener("change", () => validateDateFieldFiscalYear(input));
    input.addEventListener("blur", () => validateDateFieldFiscalYear(input));

    let currentDate = new Date(); // Tracks the displayed month
    
    // Close when clicking outside
    document.addEventListener("click", (e) => {
      if (!wrapper.contains(e.target)) {
        popover.classList.remove("active");
      }
    });
    
    btn.addEventListener("click", () => {
      // Toggle active
      const wasActive = popover.classList.contains("active");
      document.querySelectorAll(".calendar-popover").forEach(p => p.classList.remove("active"));
      
      if (!wasActive) {
        // Set display month based on input value if valid
        const val = input.value;
        const parsed = parseLocalDateStr(val);
        if (val && !isNaN(parsed.getTime())) {
          currentDate = parsed;
        } else {
          currentDate = new Date();
        }
        renderCalendar(popover, input, currentDate);
        popover.classList.add("active");
      }
    });
  });
}

function renderCalendar(popover, input, displayDate) {
  const year = displayDate.getFullYear();
  const month = displayDate.getMonth(); // 0-11
  
  // Month names in French
  const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  
  // Days of week headers
  const daysHeaderHtml = ["D", "L", "M", "M", "J", "V", "S"].map(d => `<div class="calendar-day-header">${d}</div>`).join("");
  
  // First day of current month (0: Sunday, 1: Monday, etc)
  const firstDayIndex = new Date(year, month, 1).getDay();
  
  // Last day of current month (number of days)
  const lastDay = new Date(year, month + 1, 0).getDate();
  
  // Last day of previous month
  const prevLastDay = new Date(year, month, 0).getDate();
  
  let daysHtml = "";
  
  // Render empty cells for previous month padding
  for (let x = firstDayIndex; x > 0; x--) {
    daysHtml += `<div class="calendar-day other-month">${prevLastDay - x + 1}</div>`;
  }
  
  // Render current month days
  const activeVal = input.value;
  const activeDate = activeVal ? parseLocalDateStr(activeVal) : null;
  const activeYear = activeDate ? activeDate.getFullYear() : null;
  const activeMonth = activeDate ? activeDate.getMonth() : null;
  const activeDay = activeDate ? activeDate.getDate() : null;
  
  const fyRange = getFiscalYearRange(appState.selected_year);
  const minDate = fyRange ? parseLocalDateStr(fyRange.start) : null;
  const maxDate = fyRange ? parseLocalDateStr(fyRange.end) : null;

  for (let i = 1; i <= lastDay; i++) {
    const isSelected = (activeYear === year && activeMonth === month && activeDay === i) ? "selected" : "";
    const dayDate = new Date(year, month, i);
    const isDisabled = (minDate && dayDate < minDate) || (maxDate && dayDate > maxDate);
    daysHtml += `<div class="calendar-day ${isSelected}${isDisabled ? " disabled" : ""}" ${isDisabled ? "" : `data-day="${i}"`}>${i}</div>`;
  }
  
  // Render next month padding to complete 42 grid cells
  const totalCells = firstDayIndex + lastDay;
  const nextMonthPadding = 42 - totalCells;
  for (let j = 1; j <= nextMonthPadding; j++) {
    daysHtml += `<div class="calendar-day other-month">${j}</div>`;
  }
  
  popover.innerHTML = `
    <div class="calendar-header">
      <button type="button" class="calendar-nav-btn prev-btn">&lt;</button>
      <span>${monthNames[month]} ${year}</span>
      <button type="button" class="calendar-nav-btn next-btn">&gt;</button>
    </div>
    <div class="calendar-grid">
      ${daysHeaderHtml}
      ${daysHtml}
    </div>
  `;
  
  // Wire nav buttons
  popover.querySelector(".prev-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    displayDate.setMonth(displayDate.getMonth() - 1);
    renderCalendar(popover, input, displayDate);
  });
  
  popover.querySelector(".next-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    displayDate.setMonth(displayDate.getMonth() + 1);
    renderCalendar(popover, input, displayDate);
  });
  
  // Wire day clicks
  popover.querySelectorAll(".calendar-grid .calendar-day").forEach(dayEl => {
    dayEl.addEventListener("click", (e) => {
      e.stopPropagation();
      const day = dayEl.getAttribute("data-day");
      if (day) {
        const paddedMonth = String(month + 1).padStart(2, '0');
        const paddedDay = String(day).padStart(2, '0');
        input.value = `${year}-${paddedMonth}-${paddedDay}`;
        popover.classList.remove("active");
        
        // Dispatch input event so validation runs if needed
        input.dispatchEvent(new Event("change"));
        input.dispatchEvent(new Event("input"));
      }
    });
  });
}

function initActivitiesSort() {
  const headers = document.querySelectorAll("#view-activities table th[data-sort]");
  
  // Set initial class on default sort key header
  const defaultTh = document.querySelector(`#view-activities table th[data-sort="${currentSortKey}"]`);
  if (defaultTh) {
    defaultTh.classList.add(currentSortOrder === "asc" ? "sort-asc" : "sort-desc");
  }
  
  headers.forEach(th => {
    th.addEventListener("click", () => {
      const sortKey = th.getAttribute("data-sort");
      if (currentSortKey === sortKey) {
        currentSortOrder = currentSortOrder === "asc" ? "desc" : "asc";
      } else {
        currentSortKey = sortKey;
        currentSortOrder = "asc";
      }
      
      // Update header classes
      headers.forEach(h => {
        h.classList.remove("sort-asc", "sort-desc");
      });
      th.classList.add(currentSortOrder === "asc" ? "sort-asc" : "sort-desc");
      
      renderActivities();
    });
  });
}

/* ==========================================================================
   3.8 FORM DATES HELPER FUNCTIONS
   ========================================================================== */

function updateFormDatesHelper() {
  const startVal = document.getElementById("form-activity-start").value;
  const endVal = document.getElementById("form-activity-end").value;
  const helperEl = document.getElementById("form-activity-dates-helper");
  const listEl = document.getElementById("form-activity-days-list");
  
  if (!helperEl || !listEl) return;
  
  const daysText = getDaysOfWeekInRange(startVal, endVal);
  if (daysText) {
    listEl.textContent = daysText;
    helperEl.style.display = "flex";
  } else {
    helperEl.style.display = "none";
  }
}

function getDaysOfWeekInRange(startDateStr, endDateStr) {
  if (!startDateStr || !endDateStr) return "";
  
  const start = parseLocalDateStr(startDateStr);
  const end = parseLocalDateStr(endDateStr);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return "";
  }
  
  // French day names
  const dayNames = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  
  const uniqueDays = new Set();
  let current = new Date(start);
  
  // Limit loop to prevent freezing if dates are extremely far apart (e.g. max 31 days)
  const maxIterations = 31;
  let iterations = 0;
  
  while (current <= end && iterations < maxIterations) {
    uniqueDays.add(current.getDay());
    current.setDate(current.getDate() + 1);
    iterations++;
  }
  
  // Sort day indexes (1=lundi, 2=mardi, ... 6=samedi, 0=dimanche)
  const sortedDays = Array.from(uniqueDays).sort((a, b) => {
    const orderA = a === 0 ? 7 : a;
    const orderB = b === 0 ? 7 : b;
    return orderA - orderB;
  });
  
  const dayStrings = sortedDays.map(d => dayNames[d]);
  
  if (iterations >= maxIterations) {
    return "Tous les jours de la semaine";
  }
  
  return dayStrings.join(", ");
}
