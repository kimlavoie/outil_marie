/**
 * activities.js - Activities view controller (list, CRUD drawer, and the
 * read-only detail modal)
 */

// Activities view UI state, grouped so the module's moving parts live in one place
let activitiesState = {
  sortKey: "id",
  sortOrder: "asc",
  page: 1,
  pageSize: 10,
  // Id of an activity currently open in the drawer that hasn't been saved yet (created via the
  // "Estimation" quick button). Discarded (removed from appState.activities, not just closed) if
  // the drawer is closed/cancelled without clicking "Enregistrer".
  draftActivityId: null
};

// Which flow the "Nom de l'activité" modal is currently serving: "soumission" creates and saves
// the activity immediately in soumission mode; "estimation" only builds it in memory (estimation
// mode) until the user actually saves the drawer form.
let newActivityModalIntent = "soumission";

// Activity lifecycle states, in order
const ACTIVITY_STATES = [
  { value: "brouillon", label: "Brouillon" },
  { value: "soumise", label: "Soumise au client" },
  { value: "approuvee", label: "Approuvée" },
  { value: "planifiee", label: "Planifiée" },
  { value: "facturee", label: "Facturée" },
  { value: "terminee", label: "Terminée" }
];

function getActivityStateLabel(state) {
  return (ACTIVITY_STATES.find(s => s.value === state) || ACTIVITY_STATES[0]).label;
}

function getActivityStateBadgeClass(state) {
  switch (state) {
    case "terminee": return "badge-success";
    case "facturee":
    case "planifiee": return "badge-info";
    case "approuvee": return "badge-warning";
    case "soumise": return "badge-warning";
    default: return "badge-danger";
  }
}

// {done, total, percent} of an activity's planning tasks
function getPlanningProgress(act) {
  const tasks = act.planning_tasks || [];
  const done = tasks.filter(t => t.done).length;
  const total = tasks.length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return { done, total, percent };
}

// Small progress-bar HTML snippet reused in the activities list and the Planification tab
function buildProgressBarHtml(percent) {
  return `
    <div class="progress-bar" title="${percent}%">
      <div class="progress-bar-fill ${percent >= 100 ? "complete" : ""}" style="width: ${percent}%;"></div>
    </div>
  `;
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
    const matchesSalle = !filterSalle || (act.rooms || []).some(r => r.name === filterSalle);

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
        valA = (a.rooms || []).map(r => r.name).join(", ").toLowerCase();
        valB = (b.rooms || []).map(r => r.name).join(", ").toLowerCase();
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
        valA = a.client_type === "interne" ? getRoomsTariffTotal(a) : 0;
        valB = b.client_type === "interne" ? getRoomsTariffTotal(b) : 0;
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
    tbody.innerHTML = `<tr><td colspan="10" class="text-center" style="color: var(--text-muted); padding: 32px;">Aucune activité trouvée. Cliquez sur "+ Nouvelle Activité" pour en créer une.</td></tr>`;
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
      sansFraisText = formatCurrency(getRoomsTariffTotal(act));
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

    const progress = getPlanningProgress(act);
    const stateCellHtml = isFilled ? `
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <span class="badge ${getActivityStateBadgeClass(act.state)}">${getActivityStateLabel(act.state)}</span>
        ${progress.total > 0 ? `${buildProgressBarHtml(progress.percent)}<span style="font-size: 0.7rem; color: var(--text-muted);">${progress.done}/${progress.total} tâches</span>` : ''}
      </div>
    ` : '-';

    tbody.innerHTML += `
      <tr class="activity-row ${isFilled ? '' : 'row-empty'}" data-id="${act.id}" style="cursor: pointer; ${isFilled ? '' : 'opacity: 0.5; font-style: italic;'}">
        <td class="font-mono bold">${act.id}</td>
        <td>
          <span class="bold">${isFilled ? act.name : 'Vierge'}</span> ${statusBadge}
          ${distHtml}
        </td>
        <td>${isFilled && act.responsable ? act.responsable : '-'}</td>
        <td>${datesText}</td>
        <td>${isFilled ? `${(act.rooms || []).map(r => r.name).join(", ")} (${act.client_type})` : '-'}</td>
        <td class="font-mono">${isFilled && activityReferences ? activityReferences : '-'}</td>
        <td class="bold">${isFilled ? formatCurrency(totalRev) : '-'}</td>
        <td style="color: var(--text-muted);">${sansFraisText}</td>
        <td>${stateCellHtml}</td>
        <td class="text-right" style="white-space: nowrap;">
          ${isFilled ? `
          <button class="btn-icon favorite-act-btn" data-id="${act.id}" title="${isFavoriteActivity(act.id) ? 'Retirer des accès rapides' : 'Ajouter aux accès rapides'}" style="margin-right: 4px; color: ${isFavoriteActivity(act.id) ? 'var(--warning-text, #f59e0b)' : 'inherit'};">
            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;">${isFavoriteActivity(act.id) ? '<path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>' : '<path d="M12 15.39l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.09l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.39zM12 2L9.19 8.62 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24l-7.19-.62L12 2z"/>'}</svg>
          </button>
          ` : ''}
          <button class="btn-icon edit-act-btn" data-id="${act.id}" title="Modifier" style="margin-right: 4px;">
            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>
          ${isFilled ? `
          <button class="btn-icon open-act-tab-btn" data-id="${act.id}" title="Ouvrir dans un nouvel onglet" style="margin-right: 4px;">
            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7zM5 5h5V3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-5h-2v5H5V5z"/></svg>
          </button>
          ` : ''}
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

  // Attach row click listeners to open the activity record (tabbed lifecycle view)
  document.querySelectorAll(".activity-row").forEach(row => {
    row.addEventListener("click", () => {
      openActivityDrawer(row.getAttribute("data-id"));
    });
  });

  // Attach favorite (accès rapide) toggle buttons event listeners
  document.querySelectorAll(".favorite-act-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavoriteActivity(btn.getAttribute("data-id"));
      renderActivities();
      renderQuickAccessAll();
    });
  });

  // Attach edit buttons event listeners
  document.querySelectorAll(".edit-act-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openActivityDrawer(btn.getAttribute("data-id"));
    });
  });

  // Attach "open in new tab" buttons event listeners
  document.querySelectorAll(".open-act-tab-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      const url = new URL(window.location.href);
      url.search = `?activity=${encodeURIComponent(id)}`;
      window.open(url.toString(), "_blank");
    });
  });

  // Attach duplicate buttons event listeners
  document.querySelectorAll(".duplicate-act-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      duplicateActivityAndOpen(btn.getAttribute("data-id"));
    });
  });

  // Attach delete buttons event listeners
  document.querySelectorAll(".delete-act-list-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      if (confirm(`Voulez-vous vraiment supprimer l'activité ${id} ?`)) {
        appState.activities = appState.activities.filter(a => a.id !== id);
        appState.favorites = (appState.favorites || []).filter(f => f !== id);
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

  // Open drawers buttons: creating an activity only asks for a name (see initNewActivityModal);
  // the full tabbed record opens immediately afterwards.
  document.getElementById("add-activity-btn-quick").addEventListener("click", () => openNewActivityModal("soumission"));
  document.getElementById("add-estimation-btn-quick").addEventListener("click", () => openNewActivityModal("estimation"));

  // Close buttons: discard the activity if it was only an in-memory draft (Estimation flow)
  // that was never actually saved via "Enregistrer".
  document.getElementById("activity-drawer-close").addEventListener("click", cancelActivityDrawer);
  document.getElementById("activity-drawer-cancel").addEventListener("click", cancelActivityDrawer);
  backdrop.addEventListener("click", cancelActivityDrawer);

  // Activity record tabs (Soumission et contrat / Planification / Facturation)
  document.querySelectorAll(".activity-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => switchActivityTab(btn.getAttribute("data-activity-tab")));
  });

  // Back to calendar button (only visible when opened from the calendar view)
  document.getElementById("activity-drawer-back-to-calendar-btn").addEventListener("click", () => {
    const calendarReturn = activitiesState.calendarReturn;
    cancelActivityDrawer();
    if (calendarReturn) reopenCalendarModal(calendarReturn);
  });

  // Inputs search
  const resetActivitiesPageAndRender = () => { activitiesState.page = 1; renderActivities(); };
  document.getElementById("activity-search").addEventListener("input", resetActivitiesPageAndRender);
  document.getElementById("filter-salle").addEventListener("change", resetActivitiesPageAndRender);
  document.getElementById("filter-client-type").addEventListener("change", resetActivitiesPageAndRender);

  // Account distributions buttons
  document.getElementById("form-add-distribution-btn").addEventListener("click", () => {
    addDistributionRow("", 0);
  });

  // Submit Form
  document.getElementById("activity-drawer-submit").addEventListener("click", submitActivityForm);

  // Delete Button
  document.getElementById("activity-drawer-delete").addEventListener("click", deleteActivity);

  // Dates helper updates: recompute whenever any room's start/end date changes
  const roomsScheduleContainer = document.getElementById("form-activity-rooms-schedule");
  roomsScheduleContainer.addEventListener("input", () => { updateFormDatesHelper(); updateSubmissionFinancialSummary(); });
  roomsScheduleContainer.addEventListener("change", () => { updateFormDatesHelper(); updateSubmissionFinancialSummary(); });

  // Personnel requis / Autres frais buttons
  document.getElementById("form-add-staff-btn").addEventListener("click", () => addStaffRow());
  document.getElementById("form-add-fee-btn").addEventListener("click", () => addFeeRow());

  // Planification tab buttons
  document.getElementById("generate-planning-tasks-btn").addEventListener("click", () => {
    const id = document.getElementById("form-activity-internal-id").value;
    const act = appState.activities.find(a => a.id === id);
    if (act) generatePlanningTasks(act);
  });
  document.getElementById("add-planning-task-btn").addEventListener("click", () => {
    addPlanningTaskRow({ id: generateUid("task"), description: "", done: false, auto_generated: false });
  });

  // Facturation tab button
  document.getElementById("generate-billing-lines-btn").addEventListener("click", () => {
    const id = document.getElementById("form-activity-internal-id").value;
    const act = appState.activities.find(a => a.id === id);
    if (act) generateBillingLines(act);
  });

  // Phone number masks
  maskPhoneInput(document.getElementById("form-activity-manager-phone"));
  maskPhoneInput(document.getElementById("form-activity-client-phone"));

  // Estimation / Soumission mode toggle
  initActivityModeToggle();

  // Salle(s) pill toggle group: adds/removes a schedule card per room, in addition to the usual pill active state
  initRoomsScheduleGroup();

  // Pill toggle groups (services techniques, consommation, hôtes.ses)
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

    // Alt + N or Alt + A to open the new activity modal
    if (e.altKey && (e.key.toLowerCase() === 'n' || e.key.toLowerCase() === 'a')) {
      e.preventDefault();
      openNewActivityModal();
    }

    // Escape to close drawers and modals
    if (e.key === "Escape") {
      cancelActivityDrawer();
      closeNewActivityModal();
      if (typeof closeSettingsModal === "function") {
        closeSettingsModal("account");
        closeSettingsModal("room");
        closeSettingsModal("dept");
        closeSettingsModal("salary");
      }
    }
  });
}

/* ==========================================================================
   NEW ACTIVITY MODAL (name-only creation)
   ========================================================================== */

function initNewActivityModal() {
  document.getElementById("new-activity-modal-close").addEventListener("click", closeNewActivityModal);
  document.getElementById("new-activity-modal-cancel").addEventListener("click", closeNewActivityModal);
  document.getElementById("new-activity-modal-submit").addEventListener("click", submitNewActivityForm);
}

function openNewActivityModal(intent = "soumission") {
  newActivityModalIntent = intent;
  const form = document.getElementById("new-activity-form");
  form.reset();
  document.getElementById("new-activity-modal-title").textContent = intent === "estimation" ? "Nouvelle estimation" : "Nouvelle activité";
  document.getElementById("new-activity-modal").classList.add("active");
  document.getElementById("modal-backdrop").classList.add("active");
  setTimeout(() => document.getElementById("form-new-activity-name").focus(), 150);
}

function closeNewActivityModal() {
  document.getElementById("new-activity-modal").classList.remove("active");
  document.getElementById("modal-backdrop").classList.remove("active");
}

function submitNewActivityForm(e) {
  e.preventDefault();
  const name = document.getElementById("form-new-activity-name").value.trim();
  if (!name) {
    alert("Veuillez saisir le nom de l'activité.");
    return;
  }
  const id = newActivityModalIntent === "estimation" ? createDraftActivity(name) : createActivity(name, "soumission");
  closeNewActivityModal();
  renderActivities();
  openActivityDrawer(id);
}

// Shared field defaults for a brand-new activity record (all lifecycle/submission/planning/
// billing fields at their defaults). Mirrors the defaults migrateActivities() backfills onto
// legacy records, so both paths keep producing the same shape.
function buildNewActivityRecord(id, name, mode) {
  return {
    id,
    responsable: "",
    name,
    attendees_count: 0,
    date_start: "",
    date_end: "",
    description: "",
    activity_manager: { first_name: "", last_name: "", type: "employe", phone: "", email: "" },
    client_type: "",
    rooms: [],
    technical_services: [],
    consumption: [],
    consumption_special_products: "",
    host_services: [],
    remi_hours: 0,
    department: "",
    event_type: "",
    event_type_other: "",
    distributions: [],
    state: "brouillon",
    mode,
    client: { first_name: "", last_name: "", phone: "", email: "" },
    staff: [],
    fees: [],
    submission: { file_link_id: "", generated_at: "", sent_at: "" },
    contract: { file_link_id: "", approved_at: "" },
    planning_tasks: [],
    billed_at: "",
    completed_at: ""
  };
}

// Builds a brand-new activity record, saves it immediately, and returns its id. Used by the
// "Nouvelle Activité" quick button (mode "soumission").
function createActivity(name, mode = "soumission") {
  const id = generateNextActivityId();
  appState.activities.push(buildNewActivityRecord(id, name, mode));
  saveDatabase();
  return id;
}

// Builds a brand-new activity record in "estimation" mode but only holds it in memory (not
// persisted to the database) so the "Estimation" quick button can open it in the drawer without
// registering it in the system until the user clicks "Enregistrer". See cancelActivityDrawer(),
// which discards it if the drawer is closed without saving, and submitActivityForm(), which
// clears the draft flag once it's actually saved.
function createDraftActivity(name) {
  const id = generateNextActivityId();
  appState.activities.push(buildNewActivityRecord(id, name, "estimation"));
  activitiesState.draftActivityId = id;
  return id;
}

// Duplicates an existing activity's submission data (rooms, client, services, etc.) under a
// fresh id, resetting the lifecycle fields (state, planning, submission/contract links, billing
// dates) since a duplicate always restarts its own cycle from Brouillon.
function duplicateActivityAndOpen(sourceId) {
  const source = appState.activities.find(a => a.id === sourceId);
  if (!source) return;

  const clone = JSON.parse(JSON.stringify(source));
  clone.id = generateNextActivityId();
  clone.state = "brouillon";
  clone.planning_tasks = [];
  clone.submission = { file_link_id: "", generated_at: "", sent_at: "" };
  clone.contract = { file_link_id: "", approved_at: "" };
  clone.billed_at = "";
  clone.completed_at = "";

  appState.activities.push(clone);
  saveDatabase();
  renderActivities();
  openActivityDrawer(clone.id);
}

/* ==========================================================================
   ACTIVITY RECORD: STATE BAR & TABS
   ========================================================================== */

/* ==========================================================================
   ACTIVITY RECORD: ESTIMATION / SOUMISSION MODE TOGGLE
   ========================================================================== */

// Applies the mode to the form: toggles the active pill and hides/shows the
// ".estimation-hide" sections (client identification, billing, manager,
// event type, submission/contract file links) that estimation mode skips.
// `locked` disables switching back to estimation once the activity has moved
// past Brouillon (a submitted/approved activity always needs its full data).
function applyActivityFormMode(mode, locked) {
  const toggle = document.getElementById("activity-mode-toggle");
  const panel = document.getElementById("activity-tab-panel-submission");
  toggle.querySelectorAll(".pill-toggle").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
    btn.disabled = locked;
  });
  toggle.classList.toggle("locked", locked);
  panel.classList.toggle("mode-estimation", mode === "estimation");
  document.getElementById("activity-mode-locked-hint").style.display = locked ? "block" : "none";
}

function getActivityFormMode() {
  const activeBtn = document.querySelector("#activity-mode-toggle .pill-toggle.active");
  return activeBtn ? activeBtn.dataset.mode : "estimation";
}

function initActivityModeToggle() {
  document.getElementById("activity-mode-toggle").addEventListener("click", (e) => {
    const btn = e.target.closest(".pill-toggle");
    if (!btn || btn.disabled) return;
    applyActivityFormMode(btn.dataset.mode, false);
  });
}

function switchActivityTab(tabName) {
  document.querySelectorAll(".activity-tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-activity-tab") === tabName);
  });
  document.querySelectorAll(".activity-tab-panel").forEach(panel => {
    panel.classList.toggle("active", panel.id === `activity-tab-panel-${tabName}`);
  });
}

// Renders the state badge + planning progress atop the activity record. Transition buttons
// (Marquer comme Soumise/Approuvée/Facturée/Terminée) are added by the Soumission/Facturation
// tabs once their gating logic exists.
function renderActivityStateBar(act) {
  const bar = document.getElementById("activity-state-bar");
  const progress = getPlanningProgress(act);
  bar.innerHTML = `
    <span class="badge ${getActivityStateBadgeClass(act.state)}">${getActivityStateLabel(act.state)}</span>
    ${progress.total > 0 ? `
      <div style="display: flex; align-items: center; gap: 8px; flex-grow: 1; max-width: 320px;">
        ${buildProgressBarHtml(progress.percent)}
        <span style="font-size: 0.78rem; color: var(--text-muted); white-space: nowrap;">${progress.done}/${progress.total} tâches</span>
      </div>
    ` : ''}
  `;
}

// Applies `patchFn` to the activity `id`, persists it, and refreshes the state bar / list —
// for lifecycle mutations (file links, state transitions) that happen outside the main
// "Enregistrer" form submit, so they take effect immediately.
function commitActivityPatch(id, patchFn) {
  const idx = appState.activities.findIndex(a => a.id === id);
  if (idx === -1) return;
  patchFn(appState.activities[idx]);
  saveDatabase();
  renderActivityStateBar(appState.activities[idx]);
  renderActivities();
}

/* ==========================================================================
   SUBMISSION/CONTRACT FILE LINKS (File System Access API — Chrome/Edge only)
   ========================================================================== */

const FILE_LINKS_DB_NAME = "outil_marie_file_links";
const FILE_LINKS_STORE_NAME = "links";

function openFileLinksDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FILE_LINKS_DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(FILE_LINKS_STORE_NAME)) {
        db.createObjectStore(FILE_LINKS_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSetFileLink(id, record) {
  const db = await openFileLinksDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_LINKS_STORE_NAME, "readwrite");
    tx.objectStore(FILE_LINKS_STORE_NAME).put(record, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetFileLink(id) {
  const db = await openFileLinksDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_LINKS_STORE_NAME, "readonly");
    const req = tx.objectStore(FILE_LINKS_STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

// Lets the user pick an existing file on disk and links it (via the File System Access API) to
// the given activity's submission/contract. Excel *generation* is deferred until the submission/
// contract templates are provided — this only stores a reference to a file the user produced
// manually, so they can reopen it and mark the activity Soumise/Approuvée.
async function pickAndLinkFile(activityId, kind) {
  if (!window.showOpenFilePicker) {
    alert("Le lien de fichier nécessite un navigateur compatible avec l'API File System Access (Chrome ou Edge).");
    return;
  }
  let handle;
  try {
    [handle] = await window.showOpenFilePicker();
  } catch (e) {
    return; // user cancelled the picker
  }

  const linkId = generateUid("filelink");
  await idbSetFileLink(linkId, { handle, name: handle.name });

  commitActivityPatch(activityId, (act) => {
    act[kind].file_link_id = linkId;
    if (kind === "submission") act.submission.generated_at = new Date().toISOString().split("T")[0];
  });
  renderFileLinkStatus(kind, appState.activities.find(a => a.id === activityId));
}

async function openLinkedFile(linkId) {
  const record = await idbGetFileLink(linkId);
  if (!record) {
    alert("Fichier introuvable (peut-être lié depuis un autre appareil).");
    return;
  }
  try {
    let perm = await record.handle.queryPermission({ mode: "read" });
    if (perm !== "granted") perm = await record.handle.requestPermission({ mode: "read" });
    if (perm !== "granted") {
      alert("Permission refusée pour ouvrir ce fichier.");
      return;
    }
    const file = await record.handle.getFile();
    const url = URL.createObjectURL(file);
    window.open(url, "_blank");
  } catch (e) {
    alert("Impossible d'ouvrir le fichier : " + e.message);
  }
}

// Renders the "Lier un fichier / Ouvrir / Changer" status row plus the relevant state
// transition button (Marquer comme Soumise au client / Marquer comme Approuvée).
function renderFileLinkStatus(kind, act) {
  const container = document.getElementById(kind === "submission" ? "submission-file-status" : "contract-file-status");
  if (!container) return;

  const linkId = act[kind].file_link_id;
  const linkedLabel = linkId ? `<span class="badge badge-success">Fichier lié</span>` : `<span style="color: var(--text-muted);">Aucun fichier lié</span>`;

  let transitionBtnHtml = "";
  if (kind === "submission") {
    const canSubmit = !!linkId && act.state === "brouillon";
    transitionBtnHtml = `<button type="button" id="mark-submitted-btn" class="btn btn-primary" ${canSubmit ? "" : "disabled"}>Marquer comme Soumise au client</button>`;
  } else {
    const canApprove = !!linkId && act.state === "soumise";
    transitionBtnHtml = `<button type="button" id="mark-approved-btn" class="btn btn-primary" ${canApprove ? "" : "disabled"}>Marquer comme Approuvée</button>`;
  }

  container.innerHTML = `
    ${linkedLabel}
    <button type="button" class="btn btn-secondary" id="${kind}-link-file-btn" style="padding: 6px 12px; font-size: 0.85rem;">${linkId ? "Changer le fichier lié" : "Lier un fichier"}</button>
    ${linkId ? `<button type="button" class="btn btn-secondary" id="${kind}-open-file-btn" style="padding: 6px 12px; font-size: 0.85rem;">Ouvrir</button>` : ""}
    ${transitionBtnHtml}
  `;

  container.querySelector(`#${kind}-link-file-btn`).addEventListener("click", () => pickAndLinkFile(act.id, kind));
  const openBtn = container.querySelector(`#${kind}-open-file-btn`);
  if (openBtn) openBtn.addEventListener("click", () => openLinkedFile(linkId));

  if (kind === "submission") {
    const btn = container.querySelector("#mark-submitted-btn");
    if (btn && !btn.disabled) {
      btn.addEventListener("click", () => {
        commitActivityPatch(act.id, (a) => {
          a.state = "soumise";
          a.mode = "soumission";
          a.submission.sent_at = new Date().toISOString().split("T")[0];
        });
        const updated = appState.activities.find(a => a.id === act.id);
        renderFileLinkStatus("submission", updated);
        renderFileLinkStatus("contract", updated);
      });
    }
  } else {
    const btn = container.querySelector("#mark-approved-btn");
    if (btn && !btn.disabled) {
      btn.addEventListener("click", () => {
        commitActivityPatch(act.id, (a) => {
          a.state = "approuvee";
          a.contract.approved_at = new Date().toISOString().split("T")[0];
        });
        const updated = appState.activities.find(a => a.id === act.id);
        renderFileLinkStatus("submission", updated);
        renderFileLinkStatus("contract", updated);
      });
    }
  }
}

/* ==========================================================================
   PLANIFICATION TAB (task checklist, auto-generation, progress)
   ========================================================================== */

function renderPlanningTab(act) {
  document.getElementById("planning-tasks-list").innerHTML = "";
  (act.planning_tasks || []).forEach(t => addPlanningTaskRow(t));
  updatePlanningProgressDisplay(act);
  document.getElementById("generate-planning-tasks-btn").disabled = (act.planning_tasks || []).length > 0;
}

function addPlanningTaskRow(task) {
  const container = document.getElementById("planning-tasks-list");
  const rowId = generateUid("task-row");
  const doneStyle = task.done ? "text-decoration: line-through; color: var(--text-muted);" : "";

  container.insertAdjacentHTML("beforeend", `
    <div id="${rowId}" class="distribution-row" data-task-id="${task.id}" data-auto-generated="${task.auto_generated ? "1" : ""}" style="grid-template-columns: auto 1fr auto; align-items: center;">
      <input type="checkbox" class="task-done-checkbox" ${task.done ? "checked" : ""} style="width: 18px; height: 18px; cursor: pointer;">
      <input type="text" class="form-input task-desc-input" value="${(task.description || "").replace(/"/g, "&quot;")}" placeholder="Description de la tâche" style="padding: 8px 12px; font-size: 0.85rem; ${doneStyle}">
      <button type="button" class="btn-icon delete-task-row-btn" data-row-id="${rowId}">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>
  `);

  const row = document.getElementById(rowId);
  const descInput = row.querySelector(".task-desc-input");
  const checkbox = row.querySelector(".task-done-checkbox");

  row.querySelector(".delete-task-row-btn").addEventListener("click", () => {
    row.remove();
    persistPlanningTasks();
  });
  checkbox.addEventListener("change", () => {
    descInput.style.textDecoration = checkbox.checked ? "line-through" : "none";
    descInput.style.color = checkbox.checked ? "var(--text-muted)" : "";
    persistPlanningTasks();
  });
  descInput.addEventListener("input", persistPlanningTasks);
}

function collectPlanningTasksFromForm() {
  return Array.from(document.querySelectorAll("#planning-tasks-list .distribution-row")).map(row => ({
    id: row.dataset.taskId || generateUid("task"),
    description: row.querySelector(".task-desc-input").value.trim(),
    done: row.querySelector(".task-done-checkbox").checked,
    auto_generated: row.dataset.autoGenerated === "1"
  })).filter(t => t.description);
}

function updatePlanningProgressDisplay(act) {
  const progress = getPlanningProgress(act);
  document.getElementById("planning-progress-bar-container").innerHTML = buildProgressBarHtml(progress.percent);
  document.getElementById("planning-progress-label").textContent = progress.total > 0
    ? `${progress.done}/${progress.total} tâches (${progress.percent}%)`
    : "Aucune tâche";
}

// Persists the current task list immediately (planning is a live checklist, not gated behind
// the main "Enregistrer" button) and auto-advances the state to Planifiée once every task is
// done — but never downgrades a state that has already moved past Planifiée.
function persistPlanningTasks() {
  const id = document.getElementById("form-activity-internal-id").value;
  if (!id) return;
  const tasks = collectPlanningTasksFromForm();

  commitActivityPatch(id, (act) => {
    act.planning_tasks = tasks;
    const progress = getPlanningProgress(act);
    if (progress.total > 0 && progress.done === progress.total && (act.state === "soumise" || act.state === "approuvee")) {
      act.state = "planifiee";
    }
  });

  const updated = appState.activities.find(a => a.id === id);
  updatePlanningProgressDisplay(updated);
  document.getElementById("generate-planning-tasks-btn").disabled = (updated.planning_tasks || []).length > 0;
}

// Derives the planning checklist from the Soumission tab's data: one room-reservation task per
// room (naming any linked rooms that come along with it), a personnel-reservation task per room
// that has staff attached, and one task per linked "tâche du gestionnaire" on that room's config.
function generatePlanningTasks(act) {
  if ((act.planning_tasks || []).length > 0) return;

  const tasks = [];
  (act.rooms || []).forEach(r => {
    const roomConfig = appState.settings.rooms.find(rc => rc.name === r.name);
    const linkedNames = roomConfig ? (roomConfig.linked_rooms || []) : [];
    const reserveDesc = linkedNames.length
      ? `Réserver la salle ${r.name} (et salles liées : ${linkedNames.join(", ")}) dans le logiciel officiel`
      : `Réserver la salle ${r.name} dans le logiciel officiel`;
    tasks.push({ id: generateUid("task"), description: reserveDesc, done: false, auto_generated: true });

    const hasStaffForRoom = (act.staff || []).some(s => s.source_room === r.name);
    if (hasStaffForRoom) {
      tasks.push({ id: generateUid("task"), description: `Réserver le personnel pour ${r.name}`, done: false, auto_generated: true });
    }

    (roomConfig ? roomConfig.linked_tasks || [] : []).forEach(lt => {
      tasks.push({ id: generateUid("task"), description: lt.description, done: false, auto_generated: true });
    });
  });

  commitActivityPatch(act.id, (a) => { a.planning_tasks = tasks; });
  renderPlanningTab(appState.activities.find(a => a.id === act.id));
}

/* ==========================================================================
   FACTURATION TAB (GL distribution auto-population, Facturée/Terminée)
   ========================================================================== */

// Builds distribution rows (account_code/amount/reference) from whichever room parameters,
// personnel jobs, and autres frais already carry a configured GL account — items without one
// are left out so the user adds/maps them manually, consistent with the existing distribution
// row validation (an amount without a selected account blocks saving).
function generateBillingLines(act) {
  if ((act.distributions || []).length > 0 &&
      !confirm("Des lignes de facturation existent déjà. Les remplacer par les lignes générées automatiquement ?")) {
    return;
  }

  document.getElementById("form-distribution-list").innerHTML = "";

  const rooms = collectRoomsFromForm();
  const eventDateStart = getAggregateEventDates(rooms).date_start;

  rooms.forEach(r => {
    if (r.tariff_gl_account_code && r.tariff_amount > 0) {
      const days = calculateDaysCount(r.date_start, r.date_end);
      addDistributionRow(r.tariff_gl_account_code, r.tariff_amount * days, "");
    }
  });

  document.querySelectorAll("#form-staff-list .distribution-row").forEach(row => {
    const salaryId = row.querySelector(".staff-salary-select").value;
    const salary = (appState.settings.salaries || []).find(s => s.id === salaryId);
    if (!salary || !salary.gl_account_code) return;
    const count = parseInt(row.querySelector(".staff-count-input").value, 10) || 0;
    const hours = parseFloat(row.querySelector(".staff-hours-input").value) || 0;
    const amount = getActiveSalaryRate(salary, eventDateStart) * hours * count;
    if (amount > 0) addDistributionRow(salary.gl_account_code, amount, "");
  });

  document.querySelectorAll("#form-fees-list .distribution-row").forEach(row => {
    const glCode = row.querySelector(".fee-gl-select").value;
    const amount = parseFloat(row.querySelector(".fee-amount-input").value) || 0;
    if (glCode && amount > 0) addDistributionRow(glCode, amount, "");
  });

  if (document.querySelectorAll("#form-distribution-list .distribution-row").length === 0) {
    addDistributionRow("", 0);
  }
  updateDistributionTotal();
}

// Renders the Facturée/Terminée billing dates and gated transition buttons
function renderBillingStateStatus(act) {
  const container = document.getElementById("billing-state-status");
  if (!container) return;

  const canBill = act.state === "planifiee";
  const canComplete = act.state === "facturee";

  container.innerHTML = `
    ${act.billed_at ? `<span style="color: var(--text-muted);">Facturée le ${act.billed_at}</span>` : ""}
    ${act.completed_at ? `<span style="color: var(--text-muted);">Terminée le ${act.completed_at}</span>` : ""}
    <button type="button" id="mark-billed-btn" class="btn btn-primary" ${canBill ? "" : "disabled"}>Marquer comme Facturée</button>
    <button type="button" id="mark-completed-btn" class="btn btn-primary" ${canComplete ? "" : "disabled"}>Marquer comme Terminée</button>
  `;

  const billBtn = container.querySelector("#mark-billed-btn");
  if (!billBtn.disabled) {
    billBtn.addEventListener("click", () => {
      commitActivityPatch(act.id, (a) => {
        a.state = "facturee";
        a.billed_at = new Date().toISOString().split("T")[0];
      });
      renderBillingStateStatus(appState.activities.find(a => a.id === act.id));
    });
  }

  const completeBtn = container.querySelector("#mark-completed-btn");
  if (!completeBtn.disabled) {
    completeBtn.addEventListener("click", () => {
      commitActivityPatch(act.id, (a) => {
        a.state = "terminee";
        a.completed_at = new Date().toISOString().split("T")[0];
      });
      renderBillingStateStatus(appState.activities.find(a => a.id === act.id));
    });
  }
}

// Fills the activity form fields (everything except the id/internal-id keys)
// from an existing activity object. Used by both Edit Mode and Duplicate Mode.
function fillActivityFormFields(act) {
  applyActivityFormMode(act.mode || "estimation", act.state !== "brouillon");
  document.getElementById("form-activity-name").value = act.name;
  document.getElementById("form-activity-attendees").value = act.attendees_count || "";
  document.getElementById("form-activity-client-firstname").value = act.client?.first_name || "";
  document.getElementById("form-activity-client-lastname").value = act.client?.last_name || "";
  document.getElementById("form-activity-client-phone").value = act.client?.phone || "";
  document.getElementById("form-activity-client-email").value = act.client?.email || "";
  document.getElementById("form-activity-responsable").value = act.responsable;
  document.getElementById("form-activity-client-type").value = act.client_type;
  document.getElementById("form-activity-description").value = act.description || "";
  document.getElementById("form-activity-manager-firstname").value = act.activity_manager?.first_name || "";
  document.getElementById("form-activity-manager-lastname").value = act.activity_manager?.last_name || "";
  document.getElementById("form-activity-manager-type").value = act.activity_manager?.type || "employe";
  document.getElementById("form-activity-manager-phone").value = act.activity_manager?.phone || "";
  document.getElementById("form-activity-manager-email").value = act.activity_manager?.email || "";
  setPillGroupActive("form-activity-salle-group", (act.rooms || []).map(r => r.name));
  document.getElementById("form-activity-rooms-schedule").innerHTML = "";
  (act.rooms || []).forEach(r => addRoomScheduleCard(r.name, r));
  updateFormDatesHelper();
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

  // Load personnel requis / autres frais, exactly as saved (does not re-run auto-add logic)
  document.getElementById("form-staff-list").innerHTML = "";
  (act.staff || []).forEach(s => addStaffRow(s.salary_id, s.count, s.hours, s.source_room, s.auto_generated));
  document.getElementById("form-fees-list").innerHTML = "";
  (act.fees || []).forEach(f => addFeeRow(f.description, f.amount, f.gl_account_code, f.source_room, f.auto_generated));

  renderFileLinkStatus("submission", act);
  renderFileLinkStatus("contract", act);
  updateSubmissionFinancialSummary();
  renderPlanningTab(act);
  renderBillingStateStatus(act);
}

/* ==========================================================================
   PER-ROOM SCHEDULE & TARIF (activity form "Salle(s), horaire et tarif")
   ========================================================================== */

// Wires the salle pill-toggle group: clicking a pill adds/removes that room's
// schedule card, in addition to the pill's own active state.
function initRoomsScheduleGroup() {
  const container = document.getElementById("form-activity-salle-group");
  if (!container) return;

  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".pill-toggle");
    if (!btn || !container.contains(btn)) return;

    btn.classList.toggle("active");
    const roomName = btn.dataset.value;

    if (btn.classList.contains("active")) {
      addRoomScheduleCard(roomName);
      autoAddLinkedStaffAndFees(roomName);
    } else {
      removeRoomScheduleCard(roomName);
    }
    updateFormDatesHelper();
    updateSubmissionFinancialSummary();
  });
}

// Builds one datepicker + time input pair (mirrors the markup previously used for the
// top-level install/dismantle/start/end fields, now scoped per room).
function buildRoomDateTimeFieldHtml(dateId, timeId, label) {
  return `
    <div class="form-group">
      <label for="${dateId}">${label}</label>
      <div class="datetime-input-row">
        <div class="datepicker-wrapper">
          <input type="text" id="${dateId}" class="form-input" placeholder="AAAA-MM-JJ" pattern="\\d{4}-\\d{2}-\\d{2}">
          <button type="button" class="datepicker-trigger-btn" data-target="${dateId}" title="Sélectionner depuis le calendrier">
            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM7 11h5v5H7z"/></svg>
          </button>
          <div class="calendar-popover" id="cal-popover-${dateId}"></div>
        </div>
        <input type="time" id="${timeId}" class="form-input">
        <button type="button" class="view-calendar-btn" data-target="${dateId}" title="Consulter le calendrier à cette date">
          <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
        </button>
      </div>
      <div class="field-error-msg" id="${dateId}-fy-error"></div>
    </div>
  `;
}

// Adds a schedule card for `roomName` to #form-activity-rooms-schedule. `roomData`
// (an act.rooms[] entry) pre-fills the fields when editing/duplicating an activity.
function addRoomScheduleCard(roomName, roomData = null) {
  const container = document.getElementById("form-activity-rooms-schedule");
  if (!container || container.querySelector(`[data-room-name="${CSS.escape(roomName)}"]`)) return;

  const uid = generateUid("room-card");
  const roomConfig = appState.settings.rooms.find(r => r.name === roomName);
  const tarifs = roomConfig ? getFlattenedRoomTarifs(roomConfig, roomData ? roomData.date_start : "") : [];
  const isCustomTariff = !!(roomData && !roomData.tariff_id && (roomData.tariff_description || roomData.tariff_amount));

  const tarifOptionsHtml = tarifs.map(t =>
    `<option value="${t.id}" ${roomData && roomData.tariff_id === t.id ? 'selected' : ''}>${t.description} (${t.amount}$/jour)</option>`
  ).join("");

  container.insertAdjacentHTML("beforeend", `
    <div class="room-schedule-card" id="${uid}" data-room-name="${roomName}">
      <div class="room-schedule-card-header"><span>${roomName}</span></div>

      <div class="form-group">
        <label for="${uid}-tariff-select">Tarif</label>
        <select id="${uid}-tariff-select" class="select-input room-tariff-select" style="padding: 10px 14px;">
          <option value="">Sélectionner...</option>
          ${tarifOptionsHtml}
          <option value="__custom__" ${isCustomTariff ? 'selected' : ''}>Montant personnalisé...</option>
        </select>
      </div>
      <div class="form-group-row room-tariff-custom-group" style="display: ${isCustomTariff ? 'flex' : 'none'};">
        <div class="form-group">
          <label for="${uid}-tariff-custom-desc">Description du tarif</label>
          <input type="text" id="${uid}-tariff-custom-desc" class="form-input room-tariff-custom-desc" placeholder="Ex: Rabais ponctuel" value="${isCustomTariff && roomData.tariff_description ? roomData.tariff_description.replace(/"/g, '&quot;') : ''}">
        </div>
        <div class="form-group">
          <label for="${uid}-tariff-custom-amount">Montant ($ par jour)</label>
          <input type="number" id="${uid}-tariff-custom-amount" class="form-input room-tariff-custom-amount" min="0" step="0.01" value="${isCustomTariff ? roomData.tariff_amount : ''}">
        </div>
      </div>

      <div class="form-group-row">
        ${buildRoomDateTimeFieldHtml(`${uid}-install-date`, `${uid}-install-time`, "Installation")}
        ${buildRoomDateTimeFieldHtml(`${uid}-dismantle-date`, `${uid}-dismantle-time`, "Démontage")}
      </div>
      <div class="form-group-row">
        ${buildRoomDateTimeFieldHtml(`${uid}-start-date`, `${uid}-start-time`, "Début de l'événement")}
        ${buildRoomDateTimeFieldHtml(`${uid}-end-date`, `${uid}-end-time`, "Fin de l'événement")}
      </div>
    </div>
  `);

  const card = document.getElementById(uid);

  if (roomData) {
    card.querySelector(`#${uid}-install-date`).value = roomData.install_date || "";
    card.querySelector(`#${uid}-install-time`).value = roomData.install_time || "";
    card.querySelector(`#${uid}-dismantle-date`).value = roomData.dismantle_date || "";
    card.querySelector(`#${uid}-dismantle-time`).value = roomData.dismantle_time || "";
    card.querySelector(`#${uid}-start-date`).value = roomData.date_start || "";
    card.querySelector(`#${uid}-start-time`).value = roomData.start_time || "";
    card.querySelector(`#${uid}-end-date`).value = roomData.date_end || "";
    card.querySelector(`#${uid}-end-time`).value = roomData.end_time || "";
  }

  // Wire the tarif select to reveal/hide the custom amount fields
  const tariffSelect = card.querySelector(".room-tariff-select");
  const customGroup = card.querySelector(".room-tariff-custom-group");
  tariffSelect.addEventListener("change", () => {
    customGroup.style.display = tariffSelect.value === "__custom__" ? "flex" : "none";
  });

  // Wire the datepickers for this card's 4 date fields
  card.querySelectorAll(".datepicker-wrapper").forEach(initDatepickerWrapper);
}

function removeRoomScheduleCard(roomName) {
  const container = document.getElementById("form-activity-rooms-schedule");
  const card = container?.querySelector(`[data-room-name="${CSS.escape(roomName)}"]`);
  if (card) card.remove();
}

// Reads all currently visible room schedule cards into an act.rooms[]-shaped array
function collectRoomsFromForm() {
  const cards = document.querySelectorAll("#form-activity-rooms-schedule .room-schedule-card");
  return Array.from(cards).map(card => {
    const roomName = card.dataset.roomName;
    const tariffSelect = card.querySelector(".room-tariff-select");
    let tariffId = "", tariffDescription = "", tariffAmount = 0, tariffGlAccountCode = "";

    if (tariffSelect.value === "__custom__") {
      tariffDescription = card.querySelector(".room-tariff-custom-desc").value.trim();
      tariffAmount = parseFloat(card.querySelector(".room-tariff-custom-amount").value) || 0;
    } else if (tariffSelect.value) {
      const roomConfig = appState.settings.rooms.find(r => r.name === roomName);
      const cardStartDate = card.querySelector(`#${card.id}-start-date`)?.value || "";
      const tarif = roomConfig ? getFlattenedRoomTarifs(roomConfig, cardStartDate).find(t => t.id === tariffSelect.value) : null;
      if (tarif) {
        tariffId = tarif.id;
        tariffDescription = tarif.description;
        tariffAmount = tarif.amount;
        tariffGlAccountCode = tarif.gl_account_code || "";
      }
    }

    const uid = card.id;
    return {
      name: roomName,
      tariff_id: tariffId,
      tariff_description: tariffDescription,
      tariff_amount: tariffAmount,
      tariff_gl_account_code: tariffGlAccountCode,
      install_date: card.querySelector(`#${uid}-install-date`).value,
      install_time: card.querySelector(`#${uid}-install-time`).value,
      dismantle_date: card.querySelector(`#${uid}-dismantle-date`).value,
      dismantle_time: card.querySelector(`#${uid}-dismantle-time`).value,
      date_start: card.querySelector(`#${uid}-start-date`).value,
      start_time: card.querySelector(`#${uid}-start-time`).value,
      date_end: card.querySelector(`#${uid}-end-date`).value,
      end_time: card.querySelector(`#${uid}-end-time`).value
    };
  });
}

// Aggregate {start, end} across all room cards' own start/end dates (min/max), used for
// the activity's top-level date_start/date_end (fiscal year, filtering, calendar, sorting).
function getAggregateEventDates(rooms) {
  const starts = rooms.map(r => r.date_start).filter(Boolean);
  const ends = rooms.map(r => r.date_end).filter(Boolean);
  return {
    date_start: starts.length ? starts.reduce((min, d) => d < min ? d : min) : "",
    date_end: ends.length ? ends.reduce((max, d) => d > max ? d : max) : ""
  };
}

/* ==========================================================================
   PERSONNEL REQUIS & AUTRES FRAIS (activity form, Soumission et contrat tab)
   ========================================================================== */

// Adds one personnel row. `sourceRoom`/`autoGenerated` are carried as data attributes so the
// row can be told apart from arbitrary manually-added personnel when collecting the form.
function addStaffRow(salaryId = "", count = 1, hours = 0, sourceRoom = "", autoGenerated = false) {
  const container = document.getElementById("form-staff-list");
  const rowId = generateUid("staff-row");

  const salaryOptionsHtml = (appState.settings.salaries || []).map(s =>
    `<option value="${s.id}" ${s.id === salaryId ? "selected" : ""}>${s.job}</option>`
  ).join("");

  container.insertAdjacentHTML("beforeend", `
    <div id="${rowId}" class="distribution-row" data-source-room="${sourceRoom}" data-auto-generated="${autoGenerated ? "1" : ""}" style="grid-template-columns: 1.6fr 0.7fr 0.7fr 1fr auto;">
      <select class="select-input staff-salary-select" style="padding: 8px 12px; font-size: 0.85rem;">
        <option value="">Choisir un emploi...</option>
        ${salaryOptionsHtml}
      </select>
      <input type="number" class="form-input staff-count-input" min="1" step="1" value="${count || 1}" placeholder="Qté" style="padding: 8px 12px; font-size: 0.85rem;">
      <input type="number" class="form-input staff-hours-input" min="0" step="0.25" value="${hours || 0}" placeholder="Heures" style="padding: 8px 12px; font-size: 0.85rem;">
      <span class="staff-subtotal-display" style="font-size: 0.85rem; color: var(--text-secondary); align-self: center;">0,00 $</span>
      <button type="button" class="btn-icon delete-staff-row-btn" data-row-id="${rowId}">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>
  `);

  const row = document.getElementById(rowId);
  row.querySelector(".delete-staff-row-btn").addEventListener("click", () => {
    row.remove();
    updateSubmissionFinancialSummary();
  });
  row.querySelectorAll("select, input").forEach(el => {
    el.addEventListener("input", updateSubmissionFinancialSummary);
    el.addEventListener("change", updateSubmissionFinancialSummary);
  });
  updateStaffRowSubtotal(row);
}

function updateStaffRowSubtotal(row) {
  const salaryId = row.querySelector(".staff-salary-select").value;
  const count = parseInt(row.querySelector(".staff-count-input").value, 10) || 0;
  const hours = parseFloat(row.querySelector(".staff-hours-input").value) || 0;
  const salary = (appState.settings.salaries || []).find(s => s.id === salaryId);
  const dateStr = getAggregateEventDates(collectRoomsFromForm()).date_start;
  const rate = salary ? getActiveSalaryRate(salary, dateStr) : 0;
  row.querySelector(".staff-subtotal-display").textContent = formatCurrency(rate * hours * count);
}

// Adds one "autre frais" row (description + montant + compte GL optionnel)
function addFeeRow(description = "", amount = "", glAccountCode = "", sourceRoom = "", autoGenerated = false) {
  const container = document.getElementById("form-fees-list");
  const rowId = generateUid("fee-row");

  container.insertAdjacentHTML("beforeend", `
    <div id="${rowId}" class="distribution-row" data-source-room="${sourceRoom}" data-auto-generated="${autoGenerated ? "1" : ""}">
      <input type="text" class="form-input fee-desc-input" value="${description ? description.replace(/"/g, "&quot;") : ""}" placeholder="Ex: Montage et démontage" style="padding: 8px 12px; font-size: 0.85rem;">
      <input type="number" class="form-input fee-amount-input" min="0" step="0.01" value="${amount !== "" ? amount : ""}" placeholder="Montant $" style="padding: 8px 12px; font-size: 0.85rem;">
      <select class="select-input fee-gl-select" style="padding: 8px 12px; font-size: 0.85rem;">
        ${buildGlAccountOptionsHtml(glAccountCode)}
      </select>
      <button type="button" class="btn-icon delete-fee-row-btn" data-row-id="${rowId}">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>
  `);

  const row = document.getElementById(rowId);
  row.querySelector(".delete-fee-row-btn").addEventListener("click", () => {
    row.remove();
    updateSubmissionFinancialSummary();
  });
  row.querySelectorAll("input, select").forEach(el => el.addEventListener("input", updateSubmissionFinancialSummary));
}

// When a room is added to the activity, auto-add its linked staff/fees (skipping any already
// present for that room, so toggling the room pill off/on doesn't stack duplicates).
function autoAddLinkedStaffAndFees(roomName) {
  const room = appState.settings.rooms.find(r => r.name === roomName);
  if (!room) return;

  (room.linked_staff || []).forEach(s => {
    const exists = Array.from(document.querySelectorAll("#form-staff-list .distribution-row")).some(row =>
      row.dataset.sourceRoom === roomName && row.querySelector(".staff-salary-select").value === s.salary_id
    );
    if (!exists) addStaffRow(s.salary_id, s.count, 0, roomName, true);
  });

  (room.linked_fees || []).forEach(f => {
    const exists = Array.from(document.querySelectorAll("#form-fees-list .distribution-row")).some(row =>
      row.dataset.sourceRoom === roomName && row.querySelector(".fee-desc-input").value === f.description
    );
    if (!exists) addFeeRow(f.description, f.amount, f.gl_account_code, roomName, true);
  });
}

function collectStaffFromForm() {
  return Array.from(document.querySelectorAll("#form-staff-list .distribution-row")).map(row => ({
    id: row.dataset.id || generateUid("staff"),
    salary_id: row.querySelector(".staff-salary-select").value,
    count: parseInt(row.querySelector(".staff-count-input").value, 10) || 0,
    hours: parseFloat(row.querySelector(".staff-hours-input").value) || 0,
    auto_generated: row.dataset.autoGenerated === "1",
    source_room: row.dataset.sourceRoom || ""
  })).filter(s => s.salary_id);
}

function collectFeesFromForm() {
  return Array.from(document.querySelectorAll("#form-fees-list .distribution-row")).map(row => ({
    id: row.dataset.id || generateUid("fee"),
    description: row.querySelector(".fee-desc-input").value.trim(),
    amount: parseFloat(row.querySelector(".fee-amount-input").value) || 0,
    gl_account_code: row.querySelector(".fee-gl-select").value,
    auto_generated: row.dataset.autoGenerated === "1",
    source_room: row.dataset.sourceRoom || ""
  })).filter(f => f.description);
}

// Recomputes and displays the room/personnel/frais subtotal, TPS (5%), TVQ (9.975%), and total
function updateSubmissionFinancialSummary() {
  const container = document.getElementById("submission-financial-summary");
  if (!container) return;

  const rooms = collectRoomsFromForm();
  const roomsTotal = getRoomsTariffTotal({ rooms });
  const eventDateStart = getAggregateEventDates(rooms).date_start;

  let staffTotal = 0;
  document.querySelectorAll("#form-staff-list .distribution-row").forEach(row => {
    updateStaffRowSubtotal(row);
    const salaryId = row.querySelector(".staff-salary-select").value;
    const count = parseInt(row.querySelector(".staff-count-input").value, 10) || 0;
    const hours = parseFloat(row.querySelector(".staff-hours-input").value) || 0;
    const salary = (appState.settings.salaries || []).find(s => s.id === salaryId);
    const rate = salary ? getActiveSalaryRate(salary, eventDateStart) : 0;
    staffTotal += rate * hours * count;
  });

  let feesTotal = 0;
  document.querySelectorAll("#form-fees-list .distribution-row").forEach(row => {
    feesTotal += parseFloat(row.querySelector(".fee-amount-input").value) || 0;
  });

  const subtotal = roomsTotal + staffTotal + feesTotal;
  const tps = subtotal * 0.05;
  const tvq = subtotal * 0.09975;
  const total = subtotal + tps + tvq;

  container.innerHTML = `
    <div class="financial-summary-row"><span>Location des salles</span><span>${formatCurrency(roomsTotal)}</span></div>
    <div class="financial-summary-row"><span>Personnel</span><span>${formatCurrency(staffTotal)}</span></div>
    <div class="financial-summary-row"><span>Autres frais</span><span>${formatCurrency(feesTotal)}</span></div>
    <div class="financial-summary-row"><span>Sous-total</span><span>${formatCurrency(subtotal)}</span></div>
    <div class="financial-summary-row"><span>TPS (5%)</span><span>${formatCurrency(tps)}</span></div>
    <div class="financial-summary-row"><span>TVQ (9,975%)</span><span>${formatCurrency(tvq)}</span></div>
    <div class="financial-summary-row total"><span>Total</span><span>${formatCurrency(total)}</span></div>
  `;
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

// Opens the full tabbed activity record for an existing activity (always edit mode — activities
// are created via the name-only modal/createActivity() before this is ever called).
// `calendarReturn` is an optional eventCalendarState snapshot ({refDate, viewMode}) to return to
// when the record was opened by clicking an event in the calendar.
function openActivityDrawer(id, calendarReturn = null) {
  const drawer = document.getElementById("activity-drawer");
  const backdrop = document.getElementById("drawer-backdrop");
  const form = document.getElementById("activity-form");
  const deleteBtn = document.getElementById("activity-drawer-delete");
  const titleEl = document.getElementById("activity-drawer-title");

  const act = appState.activities.find(a => a.id === id);
  if (!act) return;

  if (act.name.trim() !== "") {
    recordActivityView(act.id);
    renderQuickAccessAll();
  }

  form.reset();
  document.getElementById("form-distribution-list").innerHTML = "";
  document.getElementById("form-distribution-total-val").textContent = "0,00 $";

  titleEl.textContent = act.name.trim() !== "" ? act.name : `Activité ${act.id}`;
  document.getElementById("form-activity-internal-id").value = act.id;
  document.getElementById("form-activity-id").value = act.id;
  document.getElementById("form-activity-id").disabled = true; // Cannot edit active key
  fillActivityFormFields(act);
  renderActivityStateBar(act);
  deleteBtn.style.display = "inline-flex";

  activitiesState.calendarReturn = calendarReturn;
  document.getElementById("activity-drawer-back-to-calendar-btn").style.display = calendarReturn ? "inline-flex" : "none";

  switchActivityTab("submission");
  updateFormDatesHelper();
  clearDateFieldErrors();

  drawer.classList.add("active");
  backdrop.classList.add("active");

  // Set cursor focus directly on the first editable field (Nom de l'activité)
  setTimeout(() => {
    document.getElementById("form-activity-name").focus();
  }, 150);
}

// Kept for calendar.js, which opens the activity record from a calendar event click
function openActivityDetailModal(id, calendarReturn) {
  openActivityDrawer(id, calendarReturn);
}

function closeActivityDrawer() {
  document.getElementById("activity-drawer").classList.remove("active");
  document.getElementById("drawer-backdrop").classList.remove("active");
}

// Closes the drawer and, if it was showing an unsaved draft (Estimation flow), discards it
// entirely rather than leaving a phantom in-memory activity around.
function cancelActivityDrawer() {
  if (activitiesState.draftActivityId) {
    appState.activities = appState.activities.filter(a => a.id !== activitiesState.draftActivityId);
    activitiesState.draftActivityId = null;
    renderActivities();
  }
  closeActivityDrawer();
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
  const clientFirstName = document.getElementById("form-activity-client-firstname").value.trim();
  const clientLastName = document.getElementById("form-activity-client-lastname").value.trim();
  const clientPhone = document.getElementById("form-activity-client-phone").value.trim();
  const clientEmail = document.getElementById("form-activity-client-email").value.trim();
  const responsable = document.getElementById("form-activity-responsable").value.trim();
  const clientType = document.getElementById("form-activity-client-type").value;
  const description = document.getElementById("form-activity-description").value.trim();
  const managerFirstName = document.getElementById("form-activity-manager-firstname").value.trim();
  const managerLastName = document.getElementById("form-activity-manager-lastname").value.trim();
  const managerType = document.getElementById("form-activity-manager-type").value;
  const managerPhone = document.getElementById("form-activity-manager-phone").value.trim();
  const managerEmail = document.getElementById("form-activity-manager-email").value.trim();
  const rooms = collectRoomsFromForm();
  const { date_start: start, date_end: end } = getAggregateEventDates(rooms);
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

  // Date format YYYY-MM-DD validation, for every room's install/dismantle/start/end dates
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const fyRange = getFiscalYearRange(appState.selected_year);
  const minDate = fyRange ? parseLocalDateStr(fyRange.start) : null;
  const maxDate = fyRange ? parseLocalDateStr(fyRange.end) : null;

  for (const room of rooms) {
    const datesToCheck = [
      { value: room.install_date, label: `La date d'installation (salle ${room.name})` },
      { value: room.dismantle_date, label: `La date de démontage (salle ${room.name})` },
      { value: room.date_start, label: `La date de début (salle ${room.name})` },
      { value: room.date_end, label: `La date de fin (salle ${room.name})` }
    ];
    for (const { value, label } of datesToCheck) {
      if (!value) continue;
      if (!dateRegex.test(value) || isNaN(parseLocalDateStr(value).getTime())) {
        alert(`${label} doit être au format AAAA-MM-JJ (ex: 2026-09-01) et être une date valide.`);
        return;
      }
      if (minDate && maxDate) {
        const d = parseLocalDateStr(value);
        if (d < minDate || d > maxDate) {
          alert(`${label} doit être comprise dans l'année financière active (${appState.selected_year}).`);
          return;
        }
      }
    }
    if (room.date_start && room.date_end && parseLocalDateStr(room.date_start) > parseLocalDateStr(room.date_end)) {
      alert(`La date de début doit être antérieure ou égale à la date de fin (salle ${room.name}).`);
      return;
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

  // Only the Soumission-et-contrat and Facturation tabs' fields are collected here — lifecycle
  // fields owned by the other tabs (state, planning_tasks, submission, contract, billed_at,
  // completed_at) are merged in untouched rather than overwritten.
  const payload = {
    id: rawId,
    mode: getActivityFormMode(),
    responsable,
    name,
    attendees_count: attendeesCount,
    client: { first_name: clientFirstName, last_name: clientLastName, phone: clientPhone, email: clientEmail },
    date_start: start,
    date_end: end,
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
    staff: collectStaffFromForm(),
    fees: collectFeesFromForm(),
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

  const idx = appState.activities.findIndex(a => a.id === internalId);
  if (idx === -1) return;
  appState.activities[idx] = { ...appState.activities[idx], ...payload };

  // Now genuinely saved: no longer a pending Estimation draft that should be discarded on close.
  if (activitiesState.draftActivityId === internalId) activitiesState.draftActivityId = null;

  saveDatabase();
  closeActivityDrawer();

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
    appState.favorites = (appState.favorites || []).filter(f => f !== id);
    if (activitiesState.draftActivityId === id) activitiesState.draftActivityId = null;

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
  const helperEl = document.getElementById("form-activity-dates-helper");
  const listEl = document.getElementById("form-activity-days-list");

  if (!helperEl || !listEl) return;

  const { date_start: startVal, date_end: endVal } = getAggregateEventDates(collectRoomsFromForm());
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

