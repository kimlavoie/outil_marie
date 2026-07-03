/**
 * activities.js - Activities view controller (list, CRUD drawer, and the
 * read-only detail modal)
 */

// Activities view UI state, grouped so the module's moving parts live in one place
let activitiesState = {
  isDraftDirty: false,
  sortKey: "id",
  sortOrder: "asc",
  page: 1,
  pageSize: 10,
  detailModalActivityId: null,
  detailModalCalendarReturn: null // set to a saved eventCalendarState snapshot when the detail modal was opened from the calendar
};

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

    switch (activitiesState.sortKey) {
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
      return activitiesState.sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
    } else {
      return activitiesState.sortOrder === "asc" ? valA - valB : valB - valA;
    }
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="color: var(--text-muted); padding: 32px;">Aucune activité trouvée. Cliquez sur "+ Nouvelle Activité" pour en créer une.</td></tr>`;
    renderPaginationBar(document.getElementById("activities-pagination"), { page: activitiesState.page, pageSize: activitiesState.pageSize, totalItems: 0, onPageChange: () => {}, onPageSizeChange: () => {} });
    return;
  }

  activitiesState.page = renderPaginationBar(document.getElementById("activities-pagination"), {
    page: activitiesState.page,
    pageSize: activitiesState.pageSize,
    totalItems: filtered.length,
    onPageChange: (p) => { activitiesState.page = p; renderActivities(); },
    onPageSizeChange: (s) => { activitiesState.pageSize = s; activitiesState.page = 1; renderActivities(); }
  });
  const pageItems = filtered.slice((activitiesState.page - 1) * activitiesState.pageSize, activitiesState.page * activitiesState.pageSize);

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
        if (reconciliationState.ledgerTransactions.length > 0) {
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
  const resetActivitiesPageAndRender = () => { activitiesState.page = 1; renderActivities(); };
  document.getElementById("activity-search").addEventListener("input", resetActivitiesPageAndRender);
  document.getElementById("filter-salle").addEventListener("change", resetActivitiesPageAndRender);
  document.getElementById("filter-client-type").addEventListener("change", resetActivitiesPageAndRender);

  // Account distributions buttons
  document.getElementById("form-add-distribution-btn").addEventListener("click", () => {
    addDistributionRow("", 0);
    // Mark as dirty if adding a row in New Mode
    const internalId = document.getElementById("form-activity-internal-id").value;
    if (!internalId) {
      activitiesState.isDraftDirty = true;
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
      activitiesState.isDraftDirty = true;
    }
  });
  actForm.addEventListener("change", () => {
    const internalId = document.getElementById("form-activity-internal-id").value;
    if (!internalId) {
      activitiesState.isDraftDirty = true;
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

    activitiesState.isDraftDirty = false;
    deleteBtn.style.display = "none";
  } else {
    // New Mode
    titleEl.textContent = "Ajouter une activité";

    // Only reset and build a fresh form if there is no active draft
    if (!activitiesState.isDraftDirty) {
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
      activitiesState.isDraftDirty = false;
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
      activitiesState.isDraftDirty = true;
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
  activitiesState.isDraftDirty = false; // Reset draft flag upon successful submit

  // Re-run validation if ledger has been loaded to update statuses immediately!
  if (reconciliationState.ledgerTransactions.length > 0) {
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
    if (reconciliationState.ledgerTransactions.length > 0) {
      reconcileLedger();
    }
    renderActivities();
  }
}

function initActivitiesSort() {
  const headers = document.querySelectorAll("#view-activities table th[data-sort]");

  // Set initial class on default sort key header
  const defaultTh = document.querySelector(`#view-activities table th[data-sort="${activitiesState.sortKey}"]`);
  if (defaultTh) {
    defaultTh.classList.add(activitiesState.sortOrder === "asc" ? "sort-asc" : "sort-desc");
  }

  headers.forEach(th => {
    th.addEventListener("click", () => {
      const sortKey = th.getAttribute("data-sort");
      if (activitiesState.sortKey === sortKey) {
        activitiesState.sortOrder = activitiesState.sortOrder === "asc" ? "desc" : "asc";
      } else {
        activitiesState.sortKey = sortKey;
        activitiesState.sortOrder = "asc";
      }

      // Update header classes
      headers.forEach(h => {
        h.classList.remove("sort-asc", "sort-desc");
      });
      th.classList.add(activitiesState.sortOrder === "asc" ? "sort-asc" : "sort-desc");

      renderActivities();
    });
  });
}

/* ==========================================================================
   FORM DATES HELPER FUNCTIONS
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

/* ==========================================================================
   ACTIVITY DETAIL VIEW (Read-only summary modal)
   ========================================================================== */

function initActivityDetailModal() {
  const modal = document.getElementById("activity-detail-modal");
  const backdrop = document.getElementById("modal-backdrop");

  document.getElementById("activity-detail-modal-close").addEventListener("click", closeActivityDetailModal);
  document.getElementById("activity-detail-close-btn").addEventListener("click", closeActivityDetailModal);
  backdrop.addEventListener("click", closeActivityDetailModal);

  document.getElementById("activity-detail-edit-btn").addEventListener("click", () => {
    const id = activitiesState.detailModalActivityId;
    closeActivityDetailModal();
    if (id) openActivityDrawer(id);
  });

  document.getElementById("activity-detail-back-to-calendar-btn").addEventListener("click", () => {
    const calendarReturn = activitiesState.detailModalCalendarReturn;
    closeActivityDetailModal();
    if (calendarReturn) reopenCalendarModal(calendarReturn);
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

// `calendarReturn` is an optional eventCalendarState snapshot ({refDate, viewMode}) to
// return to when the detail modal was opened by clicking an event in the calendar
function openActivityDetailModal(id, calendarReturn) {
  const act = appState.activities.find(a => a.id === id);
  if (!act) return;

  activitiesState.detailModalActivityId = id;
  activitiesState.detailModalCalendarReturn = calendarReturn || null;

  document.getElementById("activity-detail-title").textContent = act.name.trim() !== "" ? act.name : "Activité vierge";
  document.getElementById("activity-detail-content").innerHTML = buildActivityDetailHtml(act);
  document.getElementById("activity-detail-back-to-calendar-btn").style.display = calendarReturn ? "" : "none";

  document.getElementById("activity-detail-modal").classList.add("active");
  document.getElementById("modal-backdrop").classList.add("active");
}

function closeActivityDetailModal() {
  document.getElementById("activity-detail-modal").classList.remove("active");
  document.getElementById("modal-backdrop").classList.remove("active");
  activitiesState.detailModalActivityId = null;
  activitiesState.detailModalCalendarReturn = null;
}

function buildActivityDetailHtml(act) {
  const isFilled = act.name.trim() !== "";
  const totalRev = act.distributions.reduce((sum, d) => sum + d.amount, 0);
  const days = calculateDaysCount(act.date_start, act.date_end);
  const sansFrais = act.client_type === "interne" ? days * getRoomsInternalPrice(act) : 0;

  // Reconciliation badge, mirrors the list view logic
  let statusBadge = "";
  const activityReferences = getActivityReferences(act);
  if (reconciliationState.ledgerTransactions.length > 0 && isFilled && activityReferences) {
    const related = reconciliationState.results.filter(r => r.activityId === act.id);
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
