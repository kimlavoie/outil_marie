/**
 * navigation.js - Theme, top-level view switching, shared dropdowns, and the
 * fiscal year / quarter period selector.
 */

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
  checkBackupReminder();
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
      filterSalleSelect.innerHTML += `<option value="${r.name}">${r.name}</option>`;
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

/* ==========================================================================
   PERIOD SELECTOR (fiscal year + quarters)
   ========================================================================== */

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
      if (reconciliationState.ledgerTransactions.length > 0) {
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
      if (reconciliationState.ledgerTransactions.length > 0) {
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
