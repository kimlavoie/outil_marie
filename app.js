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

// Global App State
let appState = {
  settings: {
    theme: "dark",
    rooms: [...DEFAULT_CONFIG.rooms],
    departments: [...DEFAULT_CONFIG.departments],
    accounts: [...DEFAULT_CONFIG.accounts]
  },
  activities: []
};

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
  initNavigation();
  initFormHandlers();
  initSettingsHandlers();
  initReconciliationHandlers();
  initBackupHandlers();
  
  // Render initial views
  renderAll();
});

// Load DB from LocalStorage
function loadDatabase() {
  const localData = localStorage.getItem("outil_marie_db");
  if (localData) {
    try {
      const parsed = JSON.parse(localData);
      appState.settings = parsed.settings || appState.settings;
      appState.activities = parsed.activities || [];
      
      // Safety check: ensure accounts, rooms, departments exist
      if (!appState.settings.accounts) appState.settings.accounts = [...DEFAULT_CONFIG.accounts];
      if (!appState.settings.rooms) appState.settings.rooms = [...DEFAULT_CONFIG.rooms];
      if (!appState.settings.departments) appState.settings.departments = [...DEFAULT_CONFIG.departments];
    } catch (e) {
      console.error("Error parsing local database, using defaults", e);
      seedDatabase();
    }
  } else {
    seedDatabase();
  }
}

// Seed Initial Database with empty activities list
function seedDatabase() {
  appState.settings = {
    theme: "dark",
    rooms: [...DEFAULT_CONFIG.rooms],
    departments: [...DEFAULT_CONFIG.departments],
    accounts: [...DEFAULT_CONFIG.accounts]
  };
  
  appState.activities = [];
  saveDatabase();
}

// Save state to LocalStorage
function saveDatabase() {
  localStorage.setItem("outil_marie_db", JSON.stringify(appState));
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
function initNavigation() {
  const navItems = document.querySelectorAll(".nav-item");
  const sections = document.querySelectorAll(".view-section");
  const viewTitle = document.getElementById("view-title");
  
  navItems.forEach(item => {
    item.addEventListener("click", () => {
      const view = item.getAttribute("data-view");
      
      // Update active nav item
      navItems.forEach(i => i.classList.remove("active"));
      item.classList.add("active");
      
      // Switch active section
      sections.forEach(s => s.classList.remove("active"));
      document.getElementById(`view-${view}`).classList.add("active");
      
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
      
      // Render the entered view
      renderView(view);
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
    // No special load needed
  }
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
  const roomsSelects = [
    document.getElementById("form-activity-salle"),
    document.getElementById("filter-salle")
  ];
  const deptsSelects = [
    document.getElementById("form-activity-dept")
  ];
  
  // Rooms dropdowns
  roomsSelects.forEach(select => {
    if (!select) return;
    const isFilter = select.id.includes("filter");
    select.innerHTML = isFilter ? '<option value="">Toutes les salles</option>' : '';
    appState.settings.rooms.forEach(r => {
      select.innerHTML += `<option value="${r.name}">${r.name} (Int: ${r.price_internal}$, Ext: ${r.price_external}$)</option>`;
    });
  });
  
  // Departments dropdowns
  deptsSelects.forEach(select => {
    if (!select) return;
    select.innerHTML = '';
    appState.settings.departments.forEach(d => {
      select.innerHTML += `<option value="${d}">${d}</option>`;
    });
  });

  // Account report dropdown filter
  const reportAccountSelect = document.getElementById("filter-report-account");
  if (reportAccountSelect) {
    reportAccountSelect.innerHTML = '<option value="">Tous les comptes</option>';
    appState.settings.accounts.forEach(acc => {
      reportAccountSelect.innerHTML += `<option value="${acc.code}">${acc.code} (${acc.description})</option>`;
    });
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

// Helper: Check which quarter a date belongs to
function getQuarter(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
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
    
    filledCount++;
    
    // Revenue sum for this activity
    const activityRevenue = act.distributions.reduce((sum, dist) => sum + dist.amount, 0);
    totalRevenue += activityRevenue;
    
    // Internal free valuation: client is internal, and no actual charge (revenue is zero)
    if (act.client_type === "interne" && activityRevenue === 0) {
      const days = calculateDaysCount(act.date_start, act.date_end);
      const room = appState.settings.rooms.find(r => r.name === act.room_name);
      const price = room ? room.price_internal : 0;
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
    const rName = act.room_name || "Inconnue";
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

function renderActivities() {
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
      act.reference.toLowerCase().includes(searchQuery) ||
      act.distributions.some(d => d.account_code.toLowerCase().includes(searchQuery));
      
    // Salle filter
    const matchesSalle = !filterSalle || act.room_name === filterSalle;
    
    // Client type filter
    const matchesClientType = !filterClientType || act.client_type === filterClientType;
    
    return matchesSearch && matchesSalle && matchesClientType;
  });
  
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="color: var(--text-muted); padding: 32px;">Aucune activité trouvée. Cliquez sur "+ Nouvelle Activité" pour en créer une.</td></tr>`;
    return;
  }
  
  filtered.forEach(act => {
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
                <strong>${d.account_code}</strong>: ${formatCurrency(d.amount)}
              </span>
            `;
          }).join("")}
        </div>
      `;
    }
    
    // Format dates
    let datesText = "-";
    let daysCount = 0;
    if (act.date_start && act.date_end) {
      daysCount = calculateDaysCount(act.date_start, act.date_end);
      const start = new Date(act.date_start).toLocaleDateString('fr-CA', {month: 'short', day: 'numeric'});
      const end = new Date(act.date_end).toLocaleDateString('fr-CA', {month: 'short', day: 'numeric'});
      datesText = `${start} au ${end} (${daysCount}j)`;
    }
    
    // Sans Frais estimated cost if internal client
    let sansFraisText = "-";
    if (act.client_type === "interne" && isFilled) {
      const room = appState.settings.rooms.find(r => r.name === act.room_name);
      const price = room ? room.price_internal : 0;
      sansFraisText = formatCurrency(daysCount * price);
    }
    
    // Reconciliation badge if ledger file has been uploaded
    let statusBadge = "";
    if (ledgerTransactions.length > 0 && isFilled && act.reference) {
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
      <tr class="${isFilled ? '' : 'row-empty'}" style="${isFilled ? '' : 'opacity: 0.5; font-style: italic;'}">
        <td class="font-mono bold">${act.id}</td>
        <td>
          <span class="bold">${isFilled ? act.name : 'Vierge'}</span> ${statusBadge}
          ${distHtml}
        </td>
        <td>${isFilled && act.responsable ? act.responsable : '-'}</td>
        <td>${datesText}</td>
        <td>${isFilled ? `${act.room_name} (${act.client_type})` : '-'}</td>
        <td class="font-mono">${isFilled && act.reference ? act.reference : '-'}</td>
        <td class="bold">${isFilled ? formatCurrency(totalRev) : '-'}</td>
        <td style="color: var(--text-muted);">${sansFraisText}</td>
        <td class="text-right">
          <button class="btn-icon edit-act-btn" data-id="${act.id}" title="Modifier">
            <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>
        </td>
      </tr>
    `;
  });
  
  // Attach edit buttons event listeners
  document.querySelectorAll(".edit-act-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      openActivityDrawer(btn.getAttribute("data-id"));
    });
  });
}

function initFormHandlers() {
  const drawer = document.getElementById("activity-drawer");
  const backdrop = document.getElementById("drawer-backdrop");
  
  // Open drawers buttons
  document.getElementById("add-activity-btn-quick").addEventListener("click", () => openActivityDrawer());
  document.getElementById("add-activity-btn-main").addEventListener("click", () => openActivityDrawer());
  
  // Close buttons
  document.getElementById("activity-drawer-close").addEventListener("click", closeActivityDrawer);
  document.getElementById("activity-drawer-cancel").addEventListener("click", closeActivityDrawer);
  backdrop.addEventListener("click", closeActivityDrawer);
  
  // Inputs search
  document.getElementById("activity-search").addEventListener("input", renderActivities);
  document.getElementById("filter-salle").addEventListener("change", renderActivities);
  document.getElementById("filter-client-type").addEventListener("change", renderActivities);
  
  // Account distributions buttons
  document.getElementById("form-add-distribution-btn").addEventListener("click", () => addDistributionRow("", 0));
  
  // Submit Form
  document.getElementById("activity-drawer-submit").addEventListener("click", submitActivityForm);
  
  // Delete Button
  document.getElementById("activity-drawer-delete").addEventListener("click", deleteActivity);
}

// Drawer CRUD Operations
function openActivityDrawer(id = null) {
  const drawer = document.getElementById("activity-drawer");
  const backdrop = document.getElementById("drawer-backdrop");
  const form = document.getElementById("activity-form");
  const deleteBtn = document.getElementById("activity-drawer-delete");
  const titleEl = document.getElementById("activity-drawer-title");
  
  form.reset();
  document.getElementById("form-distribution-list").innerHTML = "";
  document.getElementById("form-distribution-total-val").textContent = "0,00 $";
  
  if (id) {
    // Edit Mode
    titleEl.textContent = `Modifier l'activité ${id}`;
    const act = appState.activities.find(a => a.id === id);
    if (act) {
      document.getElementById("form-activity-internal-id").value = act.id;
      document.getElementById("form-activity-id").value = act.id;
      document.getElementById("form-activity-id").disabled = true; // Cannot edit active key
      document.getElementById("form-activity-name").value = act.name;
      document.getElementById("form-activity-responsable").value = act.responsable;
      document.getElementById("form-activity-client-type").value = act.client_type;
      document.getElementById("form-activity-start").value = act.date_start;
      document.getElementById("form-activity-end").value = act.date_end;
      document.getElementById("form-activity-salle").value = act.room_name;
      document.getElementById("form-activity-category").value = act.category;
      document.getElementById("form-activity-remi").value = act.remi_hours;
      document.getElementById("form-activity-dept").value = act.department;
      document.getElementById("form-activity-ref").value = act.reference;
      
      // Load distributions
      act.distributions.forEach(d => {
        addDistributionRow(d.account_code, d.amount);
      });
      
      // Show delete button
      deleteBtn.style.display = "inline-flex";
    }
  } else {
    // New Mode
    titleEl.textContent = "Ajouter une activité";
    document.getElementById("form-activity-internal-id").value = "";
    document.getElementById("form-activity-id").value = "";
    document.getElementById("form-activity-id").disabled = false;
    document.getElementById("form-activity-id").placeholder = "Ex: SFB 2627-032";
    
    // Defaults for dates
    document.getElementById("form-activity-start").value = new Date().toISOString().split('T')[0];
    document.getElementById("form-activity-end").value = new Date().toISOString().split('T')[0];
    
    // Add one blank distribution row
    addDistributionRow("", 0);
    
    // Hide delete button
    deleteBtn.style.display = "none";
  }
  
  drawer.classList.add("active");
  backdrop.classList.add("active");
}

function closeActivityDrawer() {
  document.getElementById("activity-drawer").classList.remove("active");
  document.getElementById("drawer-backdrop").classList.remove("active");
}

function addDistributionRow(accountCode = "", amount = 0) {
  const container = document.getElementById("form-distribution-list");
  const rowId = "dist-row-" + Date.now() + Math.random().toString(36).substr(2, 5);
  
  let optionsHtml = '<option value="">Choisir un compte...</option>';
  appState.settings.accounts.forEach(acc => {
    const isSelected = acc.code === accountCode ? 'selected' : '';
    optionsHtml += `<option value="${acc.code}" ${isSelected}>${acc.code} (${acc.description})</option>`;
  });
  
  const rowHtml = `
    <div id="${rowId}" class="distribution-row">
      <select class="select-input dist-account-select" required style="padding: 8px 12px; font-size: 0.85rem;">
        ${optionsHtml}
      </select>
      <input type="number" class="form-input dist-amount-input" required min="0" step="0.01" value="${amount > 0 ? amount : ''}" placeholder="Montant $" style="padding: 8px 12px; font-size: 0.85rem;">
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
  const responsable = document.getElementById("form-activity-responsable").value.trim();
  const clientType = document.getElementById("form-activity-client-type").value;
  const start = document.getElementById("form-activity-start").value;
  const end = document.getElementById("form-activity-end").value;
  const room = document.getElementById("form-activity-salle").value;
  const category = document.getElementById("form-activity-category").value;
  const remi = parseFloat(document.getElementById("form-activity-remi").value) || 0;
  const dept = document.getElementById("form-activity-dept").value;
  const ref = document.getElementById("form-activity-ref").value.trim();
  
  if (!rawId || !name || !start || !end) {
    alert("Veuillez remplir tous les champs obligatoires (*).");
    return;
  }
  
  if (new Date(start) > new Date(end)) {
    alert("La date de début doit être antérieure ou égale à la date de fin.");
    return;
  }
  
  // Build distributions array
  const distributions = [];
  let distError = false;
  
  document.querySelectorAll(".distribution-row").forEach(row => {
    const acc = row.querySelector(".dist-account-select").value;
    const amt = parseFloat(row.querySelector(".dist-amount-input").value) || 0;
    
    if (acc) {
      if (amt <= 0) {
        distError = true;
      } else {
        distributions.push({ account_code: acc, amount: amt });
      }
    }
  });
  
  if (distError) {
    alert("Le montant d'une ventilation doit être supérieur à 0 $.");
    return;
  }
  
  const payload = {
    id: rawId,
    responsable,
    name,
    date_start: start,
    date_end: end,
    client_type: clientType,
    room_name: room,
    category,
    remi_hours: remi,
    department: dept,
    reference: ref,
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
    
    const actRef = cleanRef(act.reference);
    if (!actRef) {
      // Active activity but no reference: marked as "unlogged" for all its distributions
      act.distributions.forEach(dist => {
        reconciliationResults.push({
          activityId: act.id,
          activityName: act.name,
          account_code: dist.account_code,
          reference: "",
          amount_saisi: dist.amount,
          amount_gl: 0,
          status: "unlogged"
        });
      });
      return;
    }
    
    // Check reconciliation for each distribution
    act.distributions.forEach(dist => {
      // Find matching ledger group key
      const key = `${dist.account_code}||${actRef}`;
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
          reference: actRef,
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
          reference: actRef,
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
  const tbody = document.getElementById("reconciliation-table-body");
  tbody.innerHTML = "";
  
  const filtered = reconciliationResults.filter(r => {
    if (currentReconFilter === "all") return true;
    return r.status === currentReconFilter;
  });
  
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="color: var(--text-muted); padding: 32px;">Aucun enregistrement dans cette catégorie.</td></tr>`;
    return;
  }
  
  filtered.forEach((r, idx) => {
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
      document.getElementById("form-activity-ref").value = r.reference;
      
      // Clear blank default distribution row and write this one
      document.getElementById("form-distribution-list").innerHTML = "";
      addDistributionRow(r.account_code, r.amount_gl);
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
        if (act.room_name === originalName) act.room_name = newName;
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
        <button class="btn-icon delete-dept-btn" data-name="${dept}" title="Supprimer" style="color: var(--danger);">
          <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
    `;
  });
  
  // Attach listeners
  document.querySelectorAll(".delete-dept-btn").forEach(btn => {
    btn.addEventListener("click", () => deleteDept(btn.getAttribute("data-name")));
  });
}

function openDeptModal() {
  document.getElementById("dept-form").reset();
  openSettingsModal("dept");
}

function submitDeptForm(e) {
  e.preventDefault();
  const name = document.getElementById("form-dept-name").value.trim();
  
  if (!name) {
    alert("Le nom du département est obligatoire.");
    return;
  }
  
  if (appState.settings.departments.some(d => d.toUpperCase() === name.toUpperCase())) {
    alert("Ce département existe déjà.");
    return;
  }
  
  appState.settings.departments.push(name);
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
      alert("La base de données a été réinitialisée avec succès !");
    }
  });
}

function handleJsonBackupFile(file) {
  const reader = new FileReader();
  
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed.settings && parsed.activities) {
        if (confirm("La restauration va écraser la base de données actuelle. Continuer ?")) {
          appState = parsed;
          saveDatabase();
          applyTheme(appState.settings.theme || "dark");
          renderAll();
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
    
    // Add activities rows
    appState.activities.forEach((act, rIdx) => {
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
      row.push(isFilled ? act.category : ""); // CATÉGORIE
      row.push(isFilled ? act.room_name : ""); // SALLE
      row.push(isFilled ? act.remi_hours : 0); // TEMPS RÉMI
      row.push(isFilled ? act.department : ""); // DÉPARTEMENT
      
      // PRIX SALLE SANS FRAIS (formule)
      // Calculated as Nbre jours * Price Internal if client is internal.
      // In excel we can write a formula that checks client type:
      // =IF(G2="interne", F2 * [price_internal], 0)
      const room = appState.settings.rooms.find(r => r.name === act.room_name);
      const priceInternal = room ? room.price_internal : 0;
      row.push({ t: 'n', f: `IF(G${excelRow}="interne", F${excelRow}*${priceInternal}, 0)` });
      
      row.push(isFilled ? act.reference : ""); // NUMÉRO DE FACTURE...
      
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
    
    // Trigger download
    XLSX.writeFile(wb, `compta_marie_rapport_${new Date().toISOString().split('T')[0]}.xlsx`);
  } catch (err) {
    console.error(err);
    alert("Erreur lors de l'export Excel : " + err.message);
  }
}

/* ==========================================================================
   3.6 GRAND LIVRE LOCAL VIEW CONTROLLER
   ========================================================================== */

function renderAccountReport() {
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
    
    act.distributions.forEach(d => {
      if (accountEntries[d.account_code]) {
        accountEntries[d.account_code].push({
          activity: act,
          amount: d.amount
        });
      } else {
        // Fallback in case account code is not in configured settings list
        accountEntries[d.account_code] = [{
          activity: act,
          amount: d.amount
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
      entries.forEach(e => {
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
            <td class="font-mono">${act.reference || '-'}</td>
            <td class="bold text-right font-mono" style="color: var(--success-text);">${formatCurrency(e.amount)}</td>
          </tr>
        `;
      });
    }
    
    container.innerHTML += `
      <div class="stat-card" style="padding: 0; overflow: hidden; display: flex; flex-direction: column; gap: 0;">
        <div style="padding: 16px 24px; border-bottom: 1px solid var(--border-color); background-color: var(--primary-light); display: flex; justify-content: space-between; align-items: center;">
          <div>
            <span class="font-mono bold" style="font-size: 1.05rem; color: var(--primary);">${acc.code}</span>
            <span class="bold" style="margin-left: 12px; font-size: 0.95rem; color: var(--text-primary);">${acc.description}</span>
          </div>
          <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 500;">
            ${entries.length} écriture(s)
          </div>
        </div>
        
        <div class="table-responsive">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background-color: var(--bg-main);">
                <th style="padding: 12px 24px; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary);">N° Activité</th>
                <th style="padding: 12px 24px; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary);">Nom de l'Activité</th>
                <th style="padding: 12px 24px; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary);">Dates d'occupation</th>
                <th style="padding: 12px 24px; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary);">Département</th>
                <th style="padding: 12px 24px; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary);">RI / Facture Réf.</th>
                <th style="padding: 12px 24px; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); text-align: right;">Montant</th>
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
      </div>
    `;
  });
}
