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
      act.distributions.some(
        d => d.account_code.toLowerCase().includes(searchQuery) || (d.reference || "").toLowerCase().includes(searchQuery)
      );

    // Salle filter
    const matchesSalle = !filterSalle || (act.reservations || []).some(r => r.room_name === filterSalle);

    // Client type filter
    const matchesClientType = !filterClientType || act.client_type === filterClientType;

    // Period filter
    let matchesPeriod = false;
    if (!act.date_start) {
      matchesPeriod = true;
    } else {
      const fy = getFiscalYear(act.date_start);
      const q = getQuarterNumber(act.date_start);
      matchesPeriod = fy === appState.selected_year && appState.selected_quarters.includes(q);
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
        valA = (a.reservations || []).map(getReservationRoomLabel).join(", ").toLowerCase();
        valB = (b.reservations || []).map(getReservationRoomLabel).join(", ").toLowerCase();
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
    renderPaginationBar(document.getElementById("activities-pagination"), {
      page: activitiesState.page,
      pageSize: activitiesState.pageSize,
      totalItems: 0,
      onPageChange: () => {},
      onPageSizeChange: () => {}
    });
    return;
  }

  activitiesState.page = renderPaginationBar(document.getElementById("activities-pagination"), {
    page: activitiesState.page,
    pageSize: activitiesState.pageSize,
    totalItems: filtered.length,
    onPageChange: p => {
      activitiesState.page = p;
      renderActivities();
    },
    onPageSizeChange: s => {
      activitiesState.pageSize = s;
      activitiesState.page = 1;
      renderActivities();
    }
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
          ${act.distributions
            .map(d => {
              const accDesc = appState.settings.accounts.find(a => a.code === d.account_code)?.description || "";
              return `
              <span class="font-mono" style="background-color: var(--bg-main); border: 1px solid var(--border-color); padding: 2px 6px; border-radius: var(--radius-sm); color: var(--text-secondary);" title="${accDesc}">
                <strong>${d.account_code}</strong>: ${formatCurrency(d.amount)}${d.reference ? ` (${d.reference})` : ""}
              </span>
            `;
            })
            .join("")}
        </div>
      `;
    }

    // Format dates
    let datesText = "-";
    let daysCount = 0;
    if (act.date_start || act.date_end) {
      if (act.date_start && act.date_end) {
        daysCount = calculateDaysCount(act.date_start, act.date_end);
        const start = parseLocalDateStr(act.date_start).toLocaleDateString("fr-CA", { month: "short", day: "numeric" });
        const end = parseLocalDateStr(act.date_end).toLocaleDateString("fr-CA", { month: "short", day: "numeric" });
        datesText = `${start} au ${end} (${daysCount}j)`;
      } else if (act.date_start) {
        const start = parseLocalDateStr(act.date_start).toLocaleDateString("fr-CA", { month: "short", day: "numeric" });
        datesText = `À partir du ${start}`;
      } else if (act.date_end) {
        const end = parseLocalDateStr(act.date_end).toLocaleDateString("fr-CA", { month: "short", day: "numeric" });
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
    const stateCellHtml = isFilled
      ? `
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <span class="badge ${getActivityStateBadgeClass(act.state)}">${getActivityStateLabel(act.state)}</span>
        ${progress.total > 0 ? `${buildProgressBarHtml(progress.percent)}<span style="font-size: 0.7rem; color: var(--text-muted);">${progress.done}/${progress.total} tâches</span>` : ""}
      </div>
    `
      : "-";

    tbody.innerHTML += `
      <tr class="activity-row ${isFilled ? "" : "row-empty"}" data-id="${act.id}" style="cursor: pointer; ${isFilled ? "" : "opacity: 0.5; font-style: italic;"}">
        <td class="font-mono bold">${act.id}</td>
        <td>
          <span class="bold">${isFilled ? act.name : "Vierge"}</span> ${statusBadge}
          ${distHtml}
        </td>
        <td>${isFilled && act.responsable ? act.responsable : "-"}</td>
        <td>${datesText}</td>
        <td>${isFilled ? `${(act.reservations || []).map(getReservationRoomLabel).join(", ")} (${act.client_type})` : "-"}</td>
        <td class="font-mono">${isFilled && activityReferences ? activityReferences : "-"}</td>
        <td class="bold">${isFilled ? formatCurrency(totalRev) : "-"}</td>
        <td style="color: var(--text-muted);">${sansFraisText}</td>
        <td>${stateCellHtml}</td>
        <td class="text-right" style="white-space: nowrap;">
          ${
            isFilled
              ? `
          <button class="btn-icon favorite-act-btn" data-id="${act.id}" title="${isFavoriteActivity(act.id) ? "Retirer des accès rapides" : "Ajouter aux accès rapides"}" style="margin-right: 4px; color: ${isFavoriteActivity(act.id) ? "var(--warning-text, #f59e0b)" : "inherit"};">
            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;">${isFavoriteActivity(act.id) ? '<path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>' : '<path d="M12 15.39l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.09l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.39zM12 2L9.19 8.62 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24l-7.19-.62L12 2z"/>'}</svg>
          </button>
          `
              : ""
          }
          <button class="btn-icon edit-act-btn" data-id="${act.id}" title="Modifier" style="margin-right: 4px;">
            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>
          ${
            isFilled
              ? `
          <button class="btn-icon open-act-tab-btn" data-id="${act.id}" title="Ouvrir dans un nouvel onglet" style="margin-right: 4px;">
            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7zM5 5h5V3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-5h-2v5H5V5z"/></svg>
          </button>
          `
              : ""
          }
          ${
            isFilled
              ? `
          <button class="btn-icon duplicate-act-btn" data-id="${act.id}" title="Dupliquer" style="margin-right: 4px;">
            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
          </button>
          `
              : ""
          }
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
    btn.addEventListener("click", e => {
      e.stopPropagation();
      toggleFavoriteActivity(btn.getAttribute("data-id"));
      renderActivities();
      renderQuickAccessAll();
    });
  });

  // Attach edit buttons event listeners
  document.querySelectorAll(".edit-act-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      openActivityDrawer(btn.getAttribute("data-id"));
    });
  });

  // Attach "open in new tab" buttons event listeners
  document.querySelectorAll(".open-act-tab-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      const url = new URL(window.location.href);
      url.search = `?activity=${encodeURIComponent(id)}`;
      window.open(url.toString(), "_blank");
    });
  });

  // Attach duplicate buttons event listeners
  document.querySelectorAll(".duplicate-act-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      duplicateActivityAndOpen(btn.getAttribute("data-id"));
    });
  });

  // Attach delete buttons event listeners
  document.querySelectorAll(".delete-act-list-btn").forEach(btn => {
    btn.addEventListener("click", e => {
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
  const backdrop = document.getElementById("drawer-backdrop");

  // Open drawers buttons: creating a "soumission" activity only asks for a name first (see
  // initNewActivityModal); "estimation" skips that step and opens the drawer directly on a
  // blank draft, since the drawer's own name field already handles an empty name (see
  // openActivityDrawer()).
  document.getElementById("add-activity-btn-quick").addEventListener("click", () => openNewActivityModal("soumission"));
  document.getElementById("add-estimation-btn-quick").addEventListener("click", () => openActivityDrawer(createDraftActivity("")));

  // Close buttons: discard the activity if it was only an in-memory draft (Estimation flow)
  // that was never actually saved via "Enregistrer".
  document.getElementById("activity-drawer-close").addEventListener("click", cancelActivityDrawer);
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
  const resetActivitiesPageAndRender = () => {
    activitiesState.page = 1;
    renderActivities();
  };
  // Debounced on the free-text search box only: typing fires an "input" event per
  // keystroke, and each one re-filters/re-sorts/re-renders the whole table.
  // Filter selects fire one discrete "change" event per interaction, so they stay immediate.
  document.getElementById("activity-search").addEventListener("input", debounce(resetActivitiesPageAndRender, 250));
  document.getElementById("filter-salle").addEventListener("change", resetActivitiesPageAndRender);
  document.getElementById("filter-client-type").addEventListener("change", resetActivitiesPageAndRender);

  // Account distributions buttons
  document.getElementById("form-add-distribution-btn").addEventListener("click", () => {
    addDistributionRow("", 0);
    autoSaveActivityForm();
  });

  // Delete Button
  document.getElementById("activity-drawer-delete").addEventListener("click", deleteActivity);

  // Submit Button (only for draft activities/estimations)
  const submitBtn = document.getElementById("activity-drawer-submit");
  if (submitBtn) {
    submitBtn.addEventListener("click", submitActivityForm);
  }

  // Auto-save form-level inputs and changes
  const activityForm = document.getElementById("activity-form");
  if (activityForm) {
    activityForm.addEventListener("input", () => {
      showAutoSaveStatus("saving");
    });
    activityForm.addEventListener("input", debounce(autoSaveActivityForm, 500));
    activityForm.addEventListener("change", () => {
      showAutoSaveStatus("saving");
      autoSaveActivityForm();
    });
  }

  // Dates helper updates: recompute whenever any créneau's date/time changes
  const reservationsContainer = document.getElementById("form-activity-reservations");
  reservationsContainer.addEventListener("input", () => {
    updateFormDatesHelper();
    updateSubmissionFinancialSummary();
    autoSaveActivityForm();
  });
  reservationsContainer.addEventListener("change", () => {
    updateFormDatesHelper();
    updateSubmissionFinancialSummary();
    autoSaveActivityForm();
  });

  // Note: Personnel requis / Services / Autres frais buttons are wired per reservation card in
  // addReservationCard(), since each réservation has its own set of rows.

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

  // "+ Ajouter une réservation" button
  initReservationsSection();

  // Note: Services techniques / Service de bar / Autres services pill groups are wired
  // per reservation card in addReservationCard(), since each réservation has its own set of fields.

  // Event type "Autre" reveals a free-text field
  document.getElementById("form-activity-event-type").addEventListener("change", e => {
    const otherGroup = document.getElementById("form-activity-event-type-other-group");
    otherGroup.style.display = e.target.value === "autre" ? "flex" : "none";
  });

  // Keyboard Shortcuts: Navigation, Add, and Escape
  window.addEventListener("keydown", e => {
    // Alt + [1-6] for switching tabs
    if (e.altKey && e.key >= "1" && e.key <= "6") {
      e.preventDefault();
      const views = ["dashboard", "activities", "validation", "account-report", "settings", "backup"];
      const targetView = views[parseInt(e.key) - 1];
      if (targetView) {
        const navBtn = document.querySelector(`.nav-item[data-view="${targetView}"] button`);
        if (navBtn) navBtn.click();
      }
    }

    // Alt + N or Alt + A to open the new activity modal
    if (e.altKey && (e.key.toLowerCase() === "n" || e.key.toLowerCase() === "a")) {
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
    coba: "",
    activity_manager: { first_name: "", last_name: "", type: "employe", phone: "", email: "" },
    client_type: "",
    reservations: [],
    department: "",
    event_type: "",
    event_type_other: "",
    distributions: [],
    state: "brouillon",
    mode,
    client: { first_name: "", last_name: "", phone: "", email: "" },
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
  document.getElementById("activity-mode-toggle").addEventListener("click", e => {
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
    ${
      progress.total > 0
        ? `
      <div style="display: flex; align-items: center; gap: 8px; flex-grow: 1; max-width: 320px;">
        ${buildProgressBarHtml(progress.percent)}
        <span style="font-size: 0.78rem; color: var(--text-muted); white-space: nowrap;">${progress.done}/${progress.total} tâches</span>
      </div>
    `
        : ""
    }
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
    req.onupgradeneeded = e => {
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
  } catch {
    return; // user cancelled the picker
  }

  const linkId = generateUid("filelink");
  await idbSetFileLink(linkId, { handle, name: handle.name });

  commitActivityPatch(activityId, act => {
    act[kind].file_link_id = linkId;
    if (kind === "submission") act.submission.generated_at = new Date().toISOString().split("T")[0];
  });
  renderFileLinkStatus(
    kind,
    appState.activities.find(a => a.id === activityId)
  );
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
  const linkedLabel = linkId
    ? `<span class="badge badge-success">Fichier lié</span>`
    : `<span style="color: var(--text-muted);">Aucun fichier lié</span>`;

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
        commitActivityPatch(act.id, a => {
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
        commitActivityPatch(act.id, a => {
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

  container.insertAdjacentHTML(
    "beforeend",
    `
    <div id="${rowId}" class="distribution-row" data-task-id="${task.id}" data-auto-generated="${task.auto_generated ? "1" : ""}" style="grid-template-columns: auto 1fr auto; align-items: center;">
      <input type="checkbox" class="task-done-checkbox" ${task.done ? "checked" : ""}>
      <input type="text" class="form-input task-desc-input" value="${(task.description || "").replace(/"/g, "&quot;")}" placeholder="Description de la tâche" style="padding: 8px 12px; font-size: 0.85rem; ${doneStyle}">
      <button type="button" class="btn-icon delete-task-row-btn" data-row-id="${rowId}">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>
  `
  );

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
  return Array.from(document.querySelectorAll("#planning-tasks-list .distribution-row"))
    .map(row => ({
      id: row.dataset.taskId || generateUid("task"),
      description: row.querySelector(".task-desc-input").value.trim(),
      done: row.querySelector(".task-done-checkbox").checked,
      auto_generated: row.dataset.autoGenerated === "1"
    }))
    .filter(t => t.description);
}

function updatePlanningProgressDisplay(act) {
  const progress = getPlanningProgress(act);
  document.getElementById("planning-progress-bar-container").innerHTML = buildProgressBarHtml(progress.percent);
  document.getElementById("planning-progress-label").textContent =
    progress.total > 0 ? `${progress.done}/${progress.total} tâches (${progress.percent}%)` : "Aucune tâche";
}

// Persists the current task list immediately (planning is a live checklist, not gated behind
// the main "Enregistrer" button) and auto-advances the state to Planifiée once every task is
// done — but never downgrades a state that has already moved past Planifiée.
function persistPlanningTasks() {
  const id = document.getElementById("form-activity-internal-id").value;
  if (!id) return;
  const tasks = collectPlanningTasksFromForm();

  commitActivityPatch(id, act => {
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
// réservation (naming any linked rooms that come along with it), a personnel-reservation task per
// réservation that has staff attached, one task per linked "tâche du gestionnaire" on that room's
// config, and one task per configured global task (Configuration > Tâches globales).
function generatePlanningTasks(act) {
  if ((act.planning_tasks || []).length > 0) return;

  const tasks = [];
  (act.reservations || []).forEach(r => {
    const roomLabel = getReservationRoomLabel(r);
    const roomConfig = r.room_name === OTHER_ROOM_VALUE ? null : appState.settings.rooms.find(rc => rc.name === r.room_name);
    const linkedNames = roomConfig ? roomConfig.linked_rooms || [] : [];
    const reserveDesc = linkedNames.length
      ? `Réserver la salle ${roomLabel} (et salles liées : ${linkedNames.join(", ")}) dans le logiciel officiel`
      : `Réserver la salle ${roomLabel} dans le logiciel officiel`;
    tasks.push({ id: generateUid("task"), description: reserveDesc, done: false, auto_generated: true });

    const hasStaffForRoom = (r.staff || []).length > 0;
    if (hasStaffForRoom) {
      tasks.push({ id: generateUid("task"), description: `Réserver le personnel pour ${roomLabel}`, done: false, auto_generated: true });
    }

    (roomConfig ? roomConfig.linked_tasks || [] : []).forEach(lt => {
      tasks.push({ id: generateUid("task"), description: lt.description, done: false, auto_generated: true });
    });
  });

  (appState.settings.global_tasks || []).forEach(gt => {
    tasks.push({ id: generateUid("task"), description: gt.description, done: false, auto_generated: true });
  });

  commitActivityPatch(act.id, a => {
    a.planning_tasks = tasks;
  });
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
  if (
    (act.distributions || []).length > 0 &&
    !confirm("Des lignes de facturation existent déjà. Les remplacer par les lignes générées automatiquement ?")
  ) {
    return;
  }

  document.getElementById("form-distribution-list").innerHTML = "";

  const reservations = collectReservationsFromForm();
  const eventDateStart = getAggregateEventDates(reservations).date_start;

  reservations.forEach(r => {
    if (r.tariff_gl_account_code && r.tariff_amount > 0) {
      addDistributionRow(r.tariff_gl_account_code, r.tariff_amount * r.slots.length, "");
    }
  });

  document.querySelectorAll("#form-activity-reservations .room-staff-list .distribution-row").forEach(row => {
    const salaryId = row.querySelector(".staff-salary-select").value;
    const salary = (appState.settings.salaries || []).find(s => s.id === salaryId);
    if (!salary || !salary.gl_account_code) return;
    const count = parseInt(row.querySelector(".staff-count-input").value, 10) || 0;
    const hours = parseFloat(row.querySelector(".staff-hours-input").value) || 0;
    const overtimeHours = parseFloat(row.querySelector(".staff-overtime-hours-input").value) || 0;
    const amount =
      getActiveSalaryRate(salary, eventDateStart) * hours * count +
      getActiveSalaryOvertimeRate(salary, eventDateStart) * overtimeHours * count;
    if (amount > 0) addDistributionRow(salary.gl_account_code, amount, "");
  });

  document.querySelectorAll("#form-activity-reservations .room-services-list .distribution-row").forEach(row => {
    const serviceId = row.querySelector(".service-select").value;
    const service = (appState.settings.services || []).find(s => s.id === serviceId);
    if (!service || !service.gl_account_code) return;
    const count = parseInt(row.querySelector(".service-count-input").value, 10) || 0;
    const hours = parseFloat(row.querySelector(".service-hours-input").value) || 0;
    const rate = getActiveServiceRate(service, eventDateStart);
    const amount = service.type === "hourly" ? rate * hours * count : rate * count;
    if (amount > 0) addDistributionRow(service.gl_account_code, amount, "");
  });

  document.querySelectorAll("#form-activity-reservations .room-fees-list .distribution-row").forEach(row => {
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
      commitActivityPatch(act.id, a => {
        a.state = "facturee";
        a.billed_at = new Date().toISOString().split("T")[0];
      });
      renderBillingStateStatus(appState.activities.find(a => a.id === act.id));
    });
  }

  const completeBtn = container.querySelector("#mark-completed-btn");
  if (!completeBtn.disabled) {
    completeBtn.addEventListener("click", () => {
      commitActivityPatch(act.id, a => {
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
  document.getElementById("form-activity-reservations").innerHTML = "";
  (act.reservations || []).forEach(r => addReservationCard(r));
  // A brand-new activity starts with one réservation and one créneau pre-filled, so the user
  // doesn't have to click "+ Ajouter une réservation" just to get going.
  if ((act.reservations || []).length === 0) {
    const card = addReservationCard();
    addSlotRow(card.querySelector(".reservation-slots-list"));
  }
  updateFormDatesHelper();
  document.getElementById("form-activity-dept").value = act.department;
  document.getElementById("form-activity-event-type").value = act.event_type || "";
  document.getElementById("form-activity-event-type-other").value = act.event_type_other || "";
  document.getElementById("form-activity-event-type-other-group").style.display = act.event_type === "autre" ? "flex" : "none";

  // Load distributions
  (act.distributions || []).forEach(d => {
    addDistributionRow(d.account_code, d.amount, d.reference);
  });

  renderFileLinkStatus("submission", act);
  renderFileLinkStatus("contract", act);
  updateSubmissionFinancialSummary();
  renderPlanningTab(act);
  renderBillingStateStatus(act);
}

/* ==========================================================================
   RÉSERVATIONS (activity form "Réservations de salle") — one card per
   réservation (salle + tarif + créneaux + services), several réservations may
   share the same salle (different services each time).
   ========================================================================== */

const WEEKDAY_PILL_OPTIONS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Jeu" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sam" },
  { value: 0, label: "Dim" }
];

// Items for the salle searchable-select: every configured room, plus a virtual "Autre" entry
function buildRoomSelectItems() {
  return [...appState.settings.rooms.map(r => ({ value: r.name, label: r.name })), { value: OTHER_ROOM_VALUE, label: "Autre" }];
}

// Wires the "+ Ajouter une réservation" button
function initReservationsSection() {
  const addBtn = document.getElementById("add-reservation-btn");
  if (!addBtn) return;
  addBtn.addEventListener("click", () => {
    addReservationCard();
    updateFormDatesHelper();
    updateSubmissionFinancialSummary();
  });
}

// Builds one datepicker + time input pair (used for the optional montage/démontage periods)
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

// Builds one datepicker + heure de début/fin trio (used for the montage/démontage periods,
// which are confined to a single date but span a start-to-end time range within that date).
function buildDatePeriodFieldHtml(dateId, startTimeId, endTimeId, label) {
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
        <input type="time" id="${startTimeId}" class="form-input" title="Heure de début">
        <span style="align-self: center; color: var(--text-muted);">à</span>
        <input type="time" id="${endTimeId}" class="form-input" title="Heure de fin">
        <button type="button" class="view-calendar-btn" data-target="${dateId}" title="Consulter le calendrier à cette date">
          <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
        </button>
      </div>
      <div class="field-error-msg" id="${dateId}-fy-error"></div>
    </div>
  `;
}

function buildTariffParameterOptionsHtml(roomName, dateStr, selectedTariffId) {
  if (!roomName || roomName === OTHER_ROOM_VALUE) return "";
  const roomConfig = appState.settings.rooms.find(r => r.name === roomName);
  const grid = roomConfig ? getActivePricingGrid(roomConfig, dateStr) : null;
  if (!grid) return "";

  let selectedParamId = "";
  if (selectedTariffId && selectedTariffId !== "__custom__" && selectedTariffId.includes("::")) {
    selectedParamId = selectedTariffId.split("::")[0];
  }

  return grid.parameters.map(p => `<option value="${p.id}" ${selectedParamId === p.id ? "selected" : ""}>${p.name}</option>`).join("");
}

function buildTariffClientTypeOptionsHtml(roomName, dateStr, selectedTariffId, selectedParamId = "") {
  if (!roomName || roomName === OTHER_ROOM_VALUE) return "";
  const roomConfig = appState.settings.rooms.find(r => r.name === roomName);
  const grid = roomConfig ? getActivePricingGrid(roomConfig, dateStr) : null;
  if (!grid) return "";

  let selectedCtId = "";
  if (selectedTariffId && selectedTariffId !== "__custom__" && selectedTariffId.includes("::")) {
    const parts = selectedTariffId.split("::");
    selectedCtId = parts[1];
    if (!selectedParamId) {
      selectedParamId = parts[0];
    }
  }

  return grid.client_types
    .map(ct => {
      let suffix = "";
      if (selectedParamId && selectedParamId !== "__custom__") {
        const cell = grid.cells.find(c => c.parameter_id === selectedParamId && c.client_type_id === ct.id);
        if (cell) {
          suffix = ` (${cell.amount}$/jour)`;
        }
      }
      return `<option value="${ct.id}" ${selectedCtId === ct.id ? "selected" : ""}>${ct.name}${suffix}</option>`;
    })
    .join("");
}

function updateResolvedPriceDisplay(card) {
  const roomName = card.querySelector(".searchable-select-value").value;
  const paramSelect = card.querySelector(".room-tariff-parameter");
  const ctSelect = card.querySelector(".room-tariff-client-type");
  const displayEl = card.querySelector(".room-tariff-resolved-price-display");
  const valEl = card.querySelector(".resolved-price-val");

  if (!paramSelect || !ctSelect || !displayEl || !valEl) return;

  const paramVal = paramSelect.value;
  const clientTypeVal = ctSelect.value;

  if (roomName && roomName !== OTHER_ROOM_VALUE && paramVal && paramVal !== "__custom__" && clientTypeVal) {
    const roomConfig = appState.settings.rooms.find(r => r.name === roomName);
    const grid = roomConfig ? getActivePricingGrid(roomConfig, "") : null;
    if (grid) {
      const cell = grid.cells.find(c => c.parameter_id === paramVal && c.client_type_id === clientTypeVal);
      const price = cell ? cell.amount : 0;
      valEl.textContent = formatCurrency(price);
      displayEl.style.display = "block";
      return;
    }
  }
  displayEl.style.display = "none";
}

function refreshReservationTariffSelect(card, roomName, selectedTariffId = "") {
  const paramSelect = card.querySelector(".room-tariff-parameter");
  const ctSelect = card.querySelector(".room-tariff-client-type");
  const ctGroup = card.querySelector(".room-tariff-client-type-group");
  const customGroup = card.querySelector(".room-tariff-custom-group");

  if (!paramSelect || !ctSelect || !ctGroup || !customGroup) return;

  const isCustom = selectedTariffId === "__custom__";

  paramSelect.innerHTML = `
    <option value="">Sélectionner...</option>
    ${buildTariffParameterOptionsHtml(roomName, "", selectedTariffId)}
    <option value="__custom__" ${isCustom ? "selected" : ""}>Montant personnalisé...</option>
  `;

  let selectedParamId = "";
  if (selectedTariffId && selectedTariffId !== "__custom__" && selectedTariffId.includes("::")) {
    selectedParamId = selectedTariffId.split("::")[0];
  }

  ctSelect.innerHTML = `
    <option value="">Sélectionner...</option>
    ${buildTariffClientTypeOptionsHtml(roomName, "", selectedTariffId, selectedParamId)}
  `;

  if (isCustom) {
    ctGroup.style.display = "none";
    customGroup.style.display = "flex";
  } else {
    ctGroup.style.display = "flex";
    customGroup.style.display = "none";
  }

  updateResolvedPriceDisplay(card);
}

// Adds one créneau row (date + heure début + heure fin) to a reservation card's slots list. The
// date field is a masked text input (like every other date field in the app: type "20260809" and
// the dashes insert themselves) rather than a native <input type="date">, whose keyboard entry
// order/behaviour is locale-dependent and can require tabbing between day/month/year segments.
function addSlotRow(container, date = "", startTime = "", endTime = "") {
  const rowId = generateUid("slot-row");
  container.insertAdjacentHTML(
    "beforeend",
    `
    <div id="${rowId}" class="distribution-row reservation-slot-row" style="grid-template-columns: 1fr 0.8fr 0.8fr auto;">
      <input type="text" class="form-input slot-date-input" placeholder="AAAA-MM-JJ" pattern="\\d{4}-\\d{2}-\\d{2}" value="${date}">
      <input type="time" class="form-input slot-start-time-input" value="${startTime}">
      <input type="time" class="form-input slot-end-time-input" value="${endTime}">
      <button type="button" class="btn-icon delete-slot-row-btn" data-row-id="${rowId}" title="Retirer ce créneau">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>
  `
  );
  const row = document.getElementById(rowId);
  maskDateInput(row.querySelector(".slot-date-input"));
  row.querySelector(".delete-slot-row-btn").addEventListener("click", () => {
    row.remove();
    updateFormDatesHelper();
    updateSubmissionFinancialSummary();
    autoSaveActivityForm();
  });
}

// Reads a reservation card's créneaux into a slots[]-shaped array (rows without a date are
// dropped, so an accidentally-blanked row doesn't get saved as a phantom créneau)
function collectSlotsFromCard(card) {
  return Array.from(card.querySelectorAll(".reservation-slots-list .reservation-slot-row"))
    .map(row => ({
      id: generateUid("slot"),
      date: row.querySelector(".slot-date-input").value,
      start_time: row.querySelector(".slot-start-time-input").value,
      end_time: row.querySelector(".slot-end-time-input").value
    }))
    .filter(s => s.date);
}

// Adds a créneau by duplicating the last row in `container` (heure début/fin included) onto
// the following day, so entering a multi-day event with the same daily schedule only takes one
// click per day. Falls back to a blank row when the list is still empty.
function addNextSlotRow(container) {
  const rows = container.querySelectorAll(".reservation-slot-row");
  const last = rows[rows.length - 1];
  if (!last) {
    addSlotRow(container);
    return;
  }

  const lastDate = last.querySelector(".slot-date-input").value;
  const startTime = last.querySelector(".slot-start-time-input").value;
  const endTime = last.querySelector(".slot-end-time-input").value;
  let nextDate = "";
  if (lastDate) {
    const d = parseLocalDateStr(lastDate);
    d.setDate(d.getDate() + 1);
    nextDate = formatDateStrLocal(d);
  }
  addSlotRow(container, nextDate, startTime, endTime);
}

// Builds the "+ Plage de jours" mini-generator markup: a date range, the weekdays to include,
// and a shared heure début/fin, so a repeating multi-day schedule can be entered in one shot
// instead of adding créneaux one at a time.
function buildSlotRangeGeneratorHtml() {
  return `
    <div class="reservation-slot-range-generator" style="display: none; border: 1px dashed var(--border-color); border-radius: var(--radius-md); padding: 12px; margin-bottom: 12px;">
      <div class="form-group-row">
        <div class="form-group">
          <label>Du</label>
          <input type="text" class="form-input slot-range-start-date" placeholder="AAAA-MM-JJ" pattern="\\d{4}-\\d{2}-\\d{2}">
        </div>
        <div class="form-group">
          <label>Au</label>
          <input type="text" class="form-input slot-range-end-date" placeholder="AAAA-MM-JJ" pattern="\\d{4}-\\d{2}-\\d{2}">
        </div>
      </div>
      <div class="form-group-row">
        <div class="form-group">
          <label>Heure de début</label>
          <input type="time" class="form-input slot-range-start-time">
        </div>
        <div class="form-group">
          <label>Heure de fin</label>
          <input type="time" class="form-input slot-range-end-time">
        </div>
      </div>
      <div class="form-group">
        <label>Jours à inclure</label>
        <div class="pill-toggle-group slot-range-weekdays-group">
          ${WEEKDAY_PILL_OPTIONS.map(d => `<button type="button" class="pill-toggle active" data-value="${d.value}">${d.label}</button>`).join("")}
        </div>
      </div>
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button type="button" class="btn btn-secondary slot-range-cancel-btn" style="padding: 6px 12px; font-size: 0.8rem;">Annuler</button>
        <button type="button" class="btn btn-primary slot-range-generate-btn" style="padding: 6px 12px; font-size: 0.8rem;">Générer les créneaux</button>
      </div>
    </div>
  `;
}

function wireSlotRangeGenerator(card) {
  const generatorEl = card.querySelector(".reservation-slot-range-generator");
  const toggleBtn = card.querySelector(".reservation-add-slot-range-btn");
  const weekdaysGroup = generatorEl.querySelector(".slot-range-weekdays-group");
  const slotsList = card.querySelector(".reservation-slots-list");
  initPillToggleEl(weekdaysGroup);
  maskDateInput(generatorEl.querySelector(".slot-range-start-date"));
  maskDateInput(generatorEl.querySelector(".slot-range-end-date"));

  toggleBtn.addEventListener("click", () => {
    generatorEl.style.display = generatorEl.style.display === "none" ? "block" : "none";
  });
  generatorEl.querySelector(".slot-range-cancel-btn").addEventListener("click", () => {
    generatorEl.style.display = "none";
  });

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  generatorEl.querySelector(".slot-range-generate-btn").addEventListener("click", () => {
    const startVal = generatorEl.querySelector(".slot-range-start-date").value;
    const endVal = generatorEl.querySelector(".slot-range-end-date").value;
    const startTime = generatorEl.querySelector(".slot-range-start-time").value;
    const endTime = generatorEl.querySelector(".slot-range-end-time").value;
    if (
      !dateRegex.test(startVal) ||
      !dateRegex.test(endVal) ||
      isNaN(parseLocalDateStr(startVal).getTime()) ||
      isNaN(parseLocalDateStr(endVal).getTime())
    ) {
      alert("Veuillez entrer une date de début et une date de fin valides (AAAA-MM-JJ).");
      return;
    }
    const start = parseLocalDateStr(startVal);
    const end = parseLocalDateStr(endVal);
    if (start > end) {
      alert("La date de début doit être antérieure ou égale à la date de fin.");
      return;
    }
    const activeWeekdays = Array.from(weekdaysGroup.querySelectorAll(".pill-toggle.active")).map(b => parseInt(b.dataset.value, 10));
    const d = new Date(start);
    while (d <= end) {
      if (activeWeekdays.includes(d.getDay())) addSlotRow(slotsList, formatDateStrLocal(d), startTime, endTime);
      d.setDate(d.getDate() + 1);
    }
    generatorEl.style.display = "none";
    updateFormDatesHelper();
    updateSubmissionFinancialSummary();
  });
}

// Adds a reservation card to #form-activity-reservations. `reservationData` (an
// act.reservations[] entry) pre-fills the fields when editing/duplicating an activity.
function addReservationCard(reservationData = null) {
  const container = document.getElementById("form-activity-reservations");
  if (!container) return;

  const uid = generateUid("res-card");
  const roomName = reservationData ? reservationData.room_name : "";
  const isOther = roomName === OTHER_ROOM_VALUE;
  const install = (reservationData && reservationData.install) || { enabled: false, date: "", time: "" };
  const dismantle = (reservationData && reservationData.dismantle) || { enabled: false, date: "", time: "" };
  const isCustomTariff = !!(
    reservationData &&
    !reservationData.tariff_id &&
    (reservationData.tariff_description || reservationData.tariff_amount)
  );

  container.insertAdjacentHTML(
    "beforeend",
    `
    <div class="reservation-card" id="${uid}" data-reservation-id="${reservationData ? reservationData.id : generateUid("res")}">
      <div class="reservation-card-header">
        <div class="form-group" style="flex: 1; margin-bottom: 0;">
          <label>Salle</label>
          ${buildSearchableSelectHtml("room-select-group", "room-search-input", "Rechercher une salle...")}
        </div>
        <button type="button" class="btn-icon remove-reservation-btn" title="Retirer cette réservation">
          <svg viewBox="0 0 24 24" style="width: 16px; height: 16px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>

      <div class="form-group room-other-details-group" style="display: ${isOther ? "flex" : "none"};">
        <label>Détails de la salle</label>
        <input type="text" class="form-input room-other-details-input" placeholder="Précisez la salle utilisée..." value="${reservationData && reservationData.room_other_details ? reservationData.room_other_details.replace(/"/g, "&quot;") : ""}">
      </div>

      <div class="form-group-row room-tariff-fields-row" style="display: flex; gap: 12px; margin-bottom: 12px;">
        <div class="form-group" style="flex: 1; margin-bottom: 0;">
          <label>Tarif - Paramètre</label>
          <select class="select-input room-tariff-parameter" style="padding: 10px 14px; width: 100%;">
            <option value="">Sélectionner...</option>
          </select>
        </div>
        <div class="form-group room-tariff-client-type-group" style="flex: 1; margin-bottom: 0; display: flex; flex-direction: column;">
          <label>Tarif - Type de client</label>
          <select class="select-input room-tariff-client-type" style="padding: 10px 14px; width: 100%;">
            <option value="">Sélectionner...</option>
          </select>
        </div>
      </div>
      <div class="room-tariff-resolved-price-display" style="font-size: 0.85rem; color: var(--text-secondary); margin-top: -6px; margin-bottom: 12px; display: none;">
        Tarif résolu : <strong class="resolved-price-val">0,00 $</strong> / jour
      </div>
      <div class="form-group-row room-tariff-custom-group" style="display: ${isCustomTariff ? "flex" : "none"};">
        <div class="form-group">
          <label>Description du tarif</label>
          <input type="text" class="form-input room-tariff-custom-desc" placeholder="Ex: Rabais ponctuel" value="${isCustomTariff && reservationData.tariff_description ? reservationData.tariff_description.replace(/"/g, "&quot;") : ""}">
        </div>
        <div class="form-group">
          <label>Montant ($ par jour)</label>
          <input type="number" class="form-input room-tariff-custom-amount" min="0" step="0.01" value="${isCustomTariff ? reservationData.tariff_amount : ""}">
        </div>
      </div>

      <div class="form-group">
        <label class="form-checkbox-label">
          <input type="checkbox" class="reservation-install-toggle" ${install.enabled ? "checked" : ""}> Montage
        </label>
      </div>
      <div class="form-group-row reservation-install-fields" style="display: ${install.enabled ? "flex" : "none"};">
        ${buildDatePeriodFieldHtml(`${uid}-install-date`, `${uid}-install-start-time`, `${uid}-install-end-time`, "Montage")}
      </div>

      <div class="form-group">
        <label class="form-checkbox-label">
          <input type="checkbox" class="reservation-dismantle-toggle" ${dismantle.enabled ? "checked" : ""}> Démontage
        </label>
      </div>
      <div class="form-group-row reservation-dismantle-fields" style="display: ${dismantle.enabled ? "flex" : "none"};">
        ${buildDatePeriodFieldHtml(`${uid}-dismantle-date`, `${uid}-dismantle-start-time`, `${uid}-dismantle-end-time`, "Démontage")}
      </div>

      <div class="distribution-section">
        <div class="distribution-header">
          <label>Créneaux</label>
          <div style="display: flex; gap: 8px;">
            <button type="button" class="btn btn-secondary reservation-add-slot-range-btn" style="padding: 6px 12px; font-size: 0.8rem;">+ Plage de jours</button>
            <button type="button" class="btn btn-secondary reservation-add-slot-btn" style="padding: 6px 12px; font-size: 0.8rem;">+ Créneau</button>
          </div>
        </div>
        ${buildSlotRangeGeneratorHtml()}
        <div class="distribution-list reservation-slots-list"></div>
      </div>

      <div class="form-group">
        <label>Services techniques</label>
        <div class="pill-toggle-group room-technical-services-group">
          ${TECHNICAL_SERVICES.map(s => `<button type="button" class="pill-toggle" data-value="${s}">${s}</button>`).join("")}
        </div>
      </div>

      <div class="form-group">
        <label>Service de bar</label>
        <div class="pill-toggle-group room-bar-toggle-group">
          <button type="button" class="pill-toggle" data-value="active">Activer le service de bar</button>
        </div>
      </div>
      <div class="room-bar-details" style="display: none;">
        <div class="form-group">
          <label>Type de boisson</label>
          <div class="pill-toggle-group room-bar-drink-group">
            ${BAR_DRINK_TYPES.map(s => `<button type="button" class="pill-toggle" data-value="${s}">${s}</button>`).join("")}
          </div>
        </div>
        <div class="form-group">
          <label>Type de service</label>
          <div class="pill-toggle-group room-bar-service-type-group">
            ${BAR_SERVICE_TYPES.map(s => `<button type="button" class="pill-toggle" data-value="${s}">${s}</button>`).join("")}
          </div>
        </div>
        <div class="form-group room-bar-hostess-count-group" style="display: none;">
          <label>Nombre d'hôtesses</label>
          <input type="number" class="form-input room-bar-hostess-count" min="1" step="1" value="1">
        </div>
        <div class="form-group">
          <label>Commande spéciale</label>
          <input type="text" class="form-input room-bar-special-order" placeholder="Précisez la commande spéciale...">
        </div>
      </div>

      <div class="form-group">
        <label>Autres services</label>
        <div class="pill-toggle-group room-host-duties-group">
          ${HOST_DUTY_OPTIONS.map(s => `<button type="button" class="pill-toggle" data-value="${s}">${s}</button>`).join("")}
        </div>
      </div>
      <div class="form-group room-host-duties-count-group" style="display: none;">
        <label>Nombre d'hôtesses</label>
        <input type="number" class="form-input room-host-duties-count" min="1" step="1" value="1">
      </div>

      <div class="distribution-section">
        <div class="distribution-header">
          <label>Personnel requis</label>
          <button type="button" class="btn btn-secondary room-add-staff-btn" style="padding: 6px 12px; font-size: 0.8rem;">+ Ajouter</button>
        </div>
        <div class="distribution-column-labels" style="display: grid; grid-template-columns: 1.4fr 0.6fr 0.6fr 0.6fr 1fr auto; gap: 12px; font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.02em; padding: 0 12px; margin-bottom: 4px;">
          <span>Emploi</span><span>Qté</span><span>Heures</span><span title="Heures en temps supplémentaire">Heures sup.</span><span>Sous-total</span><span></span>
        </div>
        <div class="distribution-list room-staff-list"></div>
      </div>

      <div class="distribution-section">
        <div class="distribution-header">
          <label>Services</label>
          <button type="button" class="btn btn-secondary room-add-service-btn" style="padding: 6px 12px; font-size: 0.8rem;">+ Ajouter</button>
        </div>
        <div class="distribution-column-labels" style="display: grid; grid-template-columns: 1.6fr 0.7fr 0.7fr 1fr auto; gap: 12px; font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.02em; padding: 0 12px; margin-bottom: 4px;">
          <span>Service</span><span>Qté</span><span title="Utilisé seulement pour les services facturés à l'heure">Heures</span><span>Sous-total</span><span></span>
        </div>
        <div class="distribution-list room-services-list"></div>
      </div>

      <div class="distribution-section">
        <div class="distribution-header">
          <label>Autres frais</label>
          <button type="button" class="btn btn-secondary room-add-fee-btn" style="padding: 6px 12px; font-size: 0.8rem;">+ Ajouter</button>
        </div>
        <div class="distribution-list room-fees-list"></div>
      </div>
    </div>
  `
  );

  const card = document.getElementById(uid);

  if (install.enabled) {
    card.querySelector(`#${uid}-install-date`).value = install.date || "";
    card.querySelector(`#${uid}-install-start-time`).value = install.start_time || "";
    card.querySelector(`#${uid}-install-end-time`).value = install.end_time || "";
  }
  if (dismantle.enabled) {
    card.querySelector(`#${uid}-dismantle-date`).value = dismantle.date || "";
    card.querySelector(`#${uid}-dismantle-start-time`).value = dismantle.start_time || "";
    card.querySelector(`#${uid}-dismantle-end-time`).value = dismantle.end_time || "";
  }

  // Remove this reservation entirely
  card.querySelector(".remove-reservation-btn").addEventListener("click", () => {
    card.remove();
    updateFormDatesHelper();
    updateSubmissionFinancialSummary();
    autoSaveActivityForm();
  });

  // Salle searchable-select: switching room resets the tarif options and reveals the "Autre"
  // free-text field; linked staff/frais are only auto-added the first time a brand-new
  // (empty) card gets a room picked, mirroring the previous pill-toggle behaviour.
  let hasAutoAddedLinked = !!reservationData;
  const otherDetailsGroup = card.querySelector(".room-other-details-group");
  initSearchableSelectEl(
    card.querySelector(".room-select-group"),
    buildRoomSelectItems(),
    value => {
      otherDetailsGroup.style.display = value === OTHER_ROOM_VALUE ? "flex" : "none";
      refreshReservationTariffSelect(card, value);
      if (!hasAutoAddedLinked && value && value !== OTHER_ROOM_VALUE) {
        hasAutoAddedLinked = true;
        autoAddLinkedStaffAndFees(card, value);
      }
      updateFormDatesHelper();
      updateSubmissionFinancialSummary();
      autoSaveActivityForm();
    },
    roomName
  );

  // Initialize the split selects with the initial value
  const selectedTariffId = isCustomTariff ? "__custom__" : reservationData ? reservationData.tariff_id : "";
  refreshReservationTariffSelect(card, roomName, selectedTariffId);

  // Wire the tarif selects to reveal/hide custom fields and show resolved price
  const paramSelect = card.querySelector(".room-tariff-parameter");
  const ctSelect = card.querySelector(".room-tariff-client-type");
  const ctGroup = card.querySelector(".room-tariff-client-type-group");
  const customGroup = card.querySelector(".room-tariff-custom-group");

  paramSelect.addEventListener("change", () => {
    const isCustom = paramSelect.value === "__custom__";
    if (isCustom) {
      ctGroup.style.display = "none";
      customGroup.style.display = "flex";
      ctSelect.value = "";
    } else {
      ctGroup.style.display = "flex";
      customGroup.style.display = "none";
      // Re-populate client types to show prices for this parameter
      const roomVal = card.querySelector(".searchable-select-value").value;
      const currentCtVal = ctSelect.value;
      ctSelect.innerHTML = `
        <option value="">Sélectionner...</option>
        ${buildTariffClientTypeOptionsHtml(roomVal, "", currentCtVal, paramSelect.value)}
      `;
      ctSelect.value = currentCtVal;
    }
    updateResolvedPriceDisplay(card);
    updateSubmissionFinancialSummary();
    autoSaveActivityForm();
  });

  ctSelect.addEventListener("change", () => {
    updateResolvedPriceDisplay(card);
    updateSubmissionFinancialSummary();
    autoSaveActivityForm();
  });

  // Montage/démontage optional toggles
  const installToggle = card.querySelector(".reservation-install-toggle");
  const installFields = card.querySelector(".reservation-install-fields");
  installToggle.addEventListener("change", () => {
    installFields.style.display = installToggle.checked ? "flex" : "none";
    autoSaveActivityForm();
  });
  const dismantleToggle = card.querySelector(".reservation-dismantle-toggle");
  const dismantleFields = card.querySelector(".reservation-dismantle-fields");
  dismantleToggle.addEventListener("change", () => {
    dismantleFields.style.display = dismantleToggle.checked ? "flex" : "none";
    autoSaveActivityForm();
  });

  // Wire the datepickers for the montage/démontage date fields
  card.querySelectorAll(".datepicker-wrapper").forEach(initDatepickerWrapper);

  // Créneaux: manual add button, plage-de-jours generator, and pre-filled rows when editing
  const slotsList = card.querySelector(".reservation-slots-list");
  card.querySelector(".reservation-add-slot-btn").addEventListener("click", () => {
    addNextSlotRow(slotsList);
    updateFormDatesHelper();
    updateSubmissionFinancialSummary();
  });
  wireSlotRangeGenerator(card);
  if (reservationData) {
    (reservationData.slots || []).forEach(s => addSlotRow(slotsList, s.date, s.start_time, s.end_time));
  }

  // Wire this card's Services techniques / Service de bar / Autres services pill groups
  const barToggleGroup = card.querySelector(".room-bar-toggle-group");
  const barDetails = card.querySelector(".room-bar-details");
  const barDrinkGroup = card.querySelector(".room-bar-drink-group");
  const barServiceTypeGroup = card.querySelector(".room-bar-service-type-group");
  const barHostessCountGroup = card.querySelector(".room-bar-hostess-count-group");
  const barSpecialOrderInput = card.querySelector(".room-bar-special-order");
  const hostDutiesGroup = card.querySelector(".room-host-duties-group");
  const hostDutiesCountGroup = card.querySelector(".room-host-duties-count-group");

  initPillToggleEl(card.querySelector(".room-technical-services-group"));
  card.querySelector(".room-technical-services-group").addEventListener("click", () => {
    autoSaveActivityForm();
  });

  initPillToggleEl(barToggleGroup);
  barToggleGroup.addEventListener("click", e => {
    const btn = e.target.closest(".pill-toggle");
    if (!btn) return;
    const active = btn.classList.contains("active");
    barDetails.style.display = active ? "block" : "none";
    if (!active) {
      setExclusivePillValueEl(barDrinkGroup, "");
      setExclusivePillValueEl(barServiceTypeGroup, "");
      barHostessCountGroup.style.display = "none";
      barSpecialOrderInput.value = "";
    }
    autoSaveActivityForm();
  });
  initExclusivePillToggleEl(barDrinkGroup, () => {
    autoSaveActivityForm();
  });
  initExclusivePillToggleEl(barServiceTypeGroup, value => {
    barHostessCountGroup.style.display =
      value === "Service d'hôtesses" || value === "Distribution de breuvages et nettoyage de coupes" ? "flex" : "none";
    autoSaveActivityForm();
  });

  initPillToggleEl(hostDutiesGroup);
  hostDutiesGroup.addEventListener("click", () => {
    const anyActive = hostDutiesGroup.querySelectorAll(".pill-toggle.active").length > 0;
    hostDutiesCountGroup.style.display = anyActive ? "flex" : "none";
    autoSaveActivityForm();
  });

  if (reservationData) {
    setPillGroupActiveEl(card.querySelector(".room-technical-services-group"), reservationData.technical_services || []);

    const barService = reservationData.bar_service || {
      active: false,
      drink_type: "",
      service_type: "",
      hostess_count: 0,
      special_order: ""
    };
    if (barService.active) {
      barToggleGroup.querySelector(".pill-toggle").classList.add("active");
      barDetails.style.display = "block";
    }
    setExclusivePillValueEl(barDrinkGroup, barService.drink_type || "");
    setExclusivePillValueEl(barServiceTypeGroup, barService.service_type || "");
    barHostessCountGroup.style.display =
      barService.service_type === "Service d'hôtesses" || barService.service_type === "Distribution de breuvages et nettoyage de coupes"
        ? "flex"
        : "none";
    card.querySelector(".room-bar-hostess-count").value = barService.hostess_count || 1;
    barSpecialOrderInput.value = barService.special_order || "";

    const hostDuties = reservationData.host_duties || { duties: [], hostess_count: 0 };
    setPillGroupActiveEl(hostDutiesGroup, hostDuties.duties || []);
    hostDutiesCountGroup.style.display = (hostDuties.duties || []).length > 0 ? "flex" : "none";
    card.querySelector(".room-host-duties-count").value = hostDuties.hostess_count || 1;
  }

  // Wire this card's own Personnel requis / Services / Autres frais buttons and lists
  const staffList = card.querySelector(".room-staff-list");
  const servicesList = card.querySelector(".room-services-list");
  const feesList = card.querySelector(".room-fees-list");
  card.querySelector(".room-add-staff-btn").addEventListener("click", () => addStaffRow(staffList));
  card.querySelector(".room-add-service-btn").addEventListener("click", () => addServiceRow(servicesList));
  card.querySelector(".room-add-fee-btn").addEventListener("click", () => addFeeRow(feesList));

  if (reservationData) {
    (reservationData.staff || []).forEach(s => addStaffRow(staffList, s.salary_id, s.count, s.hours, s.overtime_hours, s.auto_generated));
    (reservationData.services || []).forEach(s => addServiceRow(servicesList, s.service_id, s.count, s.hours, s.auto_generated));
    (reservationData.fees || []).forEach(f => addFeeRow(feesList, f.description, f.amount, f.gl_account_code, f.auto_generated));
  }

  return card;
}

// Reads all currently visible reservation cards into an act.reservations[]-shaped array
function collectReservationsFromForm() {
  const cards = document.querySelectorAll("#form-activity-reservations .reservation-card");
  return Array.from(cards).map(card => {
    const uid = card.id;
    const roomName = card.querySelector(".searchable-select-value").value;
    const isOther = roomName === OTHER_ROOM_VALUE;

    const paramSelect = card.querySelector(".room-tariff-parameter");
    const ctSelect = card.querySelector(".room-tariff-client-type");
    const paramVal = paramSelect ? paramSelect.value : "";
    const clientTypeVal = ctSelect ? ctSelect.value : "";
    let tariffId = "",
      tariffDescription = "",
      tariffAmount = 0,
      tariffGlAccountCode = "";

    if (paramVal === "__custom__") {
      tariffDescription = card.querySelector(".room-tariff-custom-desc").value.trim();
      tariffAmount = parseFloat(card.querySelector(".room-tariff-custom-amount").value) || 0;
    } else if (paramVal && clientTypeVal && !isOther) {
      const roomConfig = appState.settings.rooms.find(r => r.name === roomName);
      const slots = collectSlotsFromCard(card);
      const firstSlotDate = slots.length ? [...slots].map(s => s.date).sort()[0] : "";
      const grid = roomConfig ? getActivePricingGrid(roomConfig, firstSlotDate) : null;
      if (grid) {
        const param = grid.parameters.find(p => p.id === paramVal);
        const ct = grid.client_types.find(c => c.id === clientTypeVal);
        const cell = grid.cells.find(c => c.parameter_id === paramVal && c.client_type_id === clientTypeVal);
        if (param && ct) {
          tariffId = `${paramVal}::${clientTypeVal}`;
          tariffDescription = grid.parameters.length > 1 ? `${param.name} - ${ct.name}` : ct.name;
          tariffAmount = cell ? cell.amount : 0;
          tariffGlAccountCode = param.gl_account_code || "";
        }
      }
    }

    const installEnabled = card.querySelector(".reservation-install-toggle").checked;
    const dismantleEnabled = card.querySelector(".reservation-dismantle-toggle").checked;

    const barToggleActive = card.querySelector(".room-bar-toggle-group .pill-toggle.active") !== null;
    const barDrinkType = getExclusivePillValueEl(card.querySelector(".room-bar-drink-group"));
    const barServiceType = getExclusivePillValueEl(card.querySelector(".room-bar-service-type-group"));
    const barHostessCount = parseInt(card.querySelector(".room-bar-hostess-count").value, 10) || 0;
    const barSpecialOrder = card.querySelector(".room-bar-special-order").value.trim();
    const hostDutiesSelected = Array.from(card.querySelectorAll(".room-host-duties-group .pill-toggle.active")).map(b => b.dataset.value);
    const hostDutiesCount = parseInt(card.querySelector(".room-host-duties-count").value, 10) || 0;

    return {
      id: card.dataset.reservationId,
      room_name: roomName,
      room_other_details: isOther ? card.querySelector(".room-other-details-input").value.trim() : "",
      tariff_id: tariffId,
      tariff_description: tariffDescription,
      tariff_amount: tariffAmount,
      tariff_gl_account_code: tariffGlAccountCode,
      install: {
        enabled: installEnabled,
        date: installEnabled ? card.querySelector(`#${uid}-install-date`).value : "",
        start_time: installEnabled ? card.querySelector(`#${uid}-install-start-time`).value : "",
        end_time: installEnabled ? card.querySelector(`#${uid}-install-end-time`).value : ""
      },
      dismantle: {
        enabled: dismantleEnabled,
        date: dismantleEnabled ? card.querySelector(`#${uid}-dismantle-date`).value : "",
        start_time: dismantleEnabled ? card.querySelector(`#${uid}-dismantle-start-time`).value : "",
        end_time: dismantleEnabled ? card.querySelector(`#${uid}-dismantle-end-time`).value : ""
      },
      slots: collectSlotsFromCard(card),
      technical_services: Array.from(card.querySelectorAll(".room-technical-services-group .pill-toggle.active")).map(b => b.dataset.value),
      bar_service: {
        active: barToggleActive,
        drink_type: barToggleActive ? barDrinkType : "",
        service_type: barToggleActive ? barServiceType : "",
        hostess_count:
          barToggleActive &&
          (barServiceType === "Service d'hôtesses" || barServiceType === "Distribution de breuvages et nettoyage de coupes")
            ? barHostessCount
            : 0,
        special_order: barToggleActive ? barSpecialOrder : ""
      },
      host_duties: {
        duties: hostDutiesSelected,
        hostess_count: hostDutiesSelected.length > 0 ? hostDutiesCount : 0
      },
      staff: collectStaffFromForm(card),
      services: collectServicesFromForm(card),
      fees: collectFeesFromForm(card)
    };
  });
}

// Aggregate {start, end} across every créneau of every réservation (min/max), used for the
// activity's top-level date_start/date_end (fiscal year, filtering, calendar, sorting).
function getAggregateEventDates(reservations) {
  const allDates = reservations.flatMap(r => (r.slots || []).map(s => s.date)).filter(Boolean);
  return {
    date_start: allDates.length ? allDates.reduce((min, d) => (d < min ? d : min)) : "",
    date_end: allDates.length ? allDates.reduce((max, d) => (d > max ? d : max)) : ""
  };
}

/* ==========================================================================
   PERSONNEL REQUIS & AUTRES FRAIS (activity form, Soumission et contrat tab)
   ========================================================================== */

// Adds one personnel row to `container` (a room card's own .room-staff-list). `autoGenerated`
// is carried as a data attribute so the row can be told apart from manually-added personnel.
function addStaffRow(container, salaryId = "", count = 1, hours = 0, overtimeHours = 0, autoGenerated = false) {
  const rowId = generateUid("staff-row");

  const salaryOptionsHtml = (appState.settings.salaries || [])
    .map(s => `<option value="${s.id}" ${s.id === salaryId ? "selected" : ""}>${s.job}</option>`)
    .join("");

  container.insertAdjacentHTML(
    "beforeend",
    `
    <div id="${rowId}" class="distribution-row" data-auto-generated="${autoGenerated ? "1" : ""}" style="grid-template-columns: 1.4fr 0.6fr 0.6fr 0.6fr 1fr auto;">
      <select class="select-input staff-salary-select" style="padding: 8px 12px; font-size: 0.85rem;">
        <option value="">Choisir un emploi...</option>
        ${salaryOptionsHtml}
      </select>
      <input type="number" class="form-input staff-count-input" min="1" step="1" value="${count || 1}" placeholder="Qté" style="padding: 8px 12px; font-size: 0.85rem;">
      <input type="number" class="form-input staff-hours-input" min="0" step="0.25" value="${hours || 0}" placeholder="Heures" style="padding: 8px 12px; font-size: 0.85rem;">
      <input type="number" class="form-input staff-overtime-hours-input" min="0" step="0.25" value="${overtimeHours || 0}" placeholder="Heures sup." title="Heures en temps supplémentaire" style="padding: 8px 12px; font-size: 0.85rem;">
      <span class="staff-subtotal-display" style="font-size: 0.85rem; color: var(--text-secondary); align-self: center;">0,00 $</span>
      <button type="button" class="btn-icon delete-staff-row-btn" data-row-id="${rowId}">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>
  `
  );

  const row = document.getElementById(rowId);
  row.querySelector(".delete-staff-row-btn").addEventListener("click", () => {
    row.remove();
    updateSubmissionFinancialSummary();
    autoSaveActivityForm();
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
  const overtimeHours = parseFloat(row.querySelector(".staff-overtime-hours-input").value) || 0;
  const salary = (appState.settings.salaries || []).find(s => s.id === salaryId);
  const dateStr = getAggregateEventDates(collectReservationsFromForm()).date_start;
  const rate = salary ? getActiveSalaryRate(salary, dateStr) : 0;
  const overtimeRate = salary ? getActiveSalaryOvertimeRate(salary, dateStr) : 0;
  row.querySelector(".staff-subtotal-display").textContent = formatCurrency(rate * hours * count + overtimeRate * overtimeHours * count);
}

// Adds one service row (a pre-configured fixed or hourly fee, from the Services settings tab)
// to `container` (a room card's own .room-services-list). `autoGenerated` is carried as a data
// attribute for parity with staff/fee rows, even though services have no room-linking auto-add today.
function addServiceRow(container, serviceId = "", count = 1, hours = 0, autoGenerated = false) {
  const rowId = generateUid("service-row");

  const serviceOptionsHtml = (appState.settings.services || [])
    .map(s => `<option value="${s.id}" ${s.id === serviceId ? "selected" : ""}>${s.name}</option>`)
    .join("");

  container.insertAdjacentHTML(
    "beforeend",
    `
    <div id="${rowId}" class="distribution-row" data-auto-generated="${autoGenerated ? "1" : ""}" style="grid-template-columns: 1.6fr 0.7fr 0.7fr 1fr auto;">
      <select class="select-input service-select" style="padding: 8px 12px; font-size: 0.85rem;">
        <option value="">Choisir un service...</option>
        ${serviceOptionsHtml}
      </select>
      <input type="number" class="form-input service-count-input" min="1" step="1" value="${count || 1}" placeholder="Qté" style="padding: 8px 12px; font-size: 0.85rem;">
      <input type="number" class="form-input service-hours-input" min="0" step="0.25" value="${hours || 0}" placeholder="Heures" style="padding: 8px 12px; font-size: 0.85rem;">
      <span class="service-subtotal-display" style="font-size: 0.85rem; color: var(--text-secondary); align-self: center;">0,00 $</span>
      <button type="button" class="btn-icon delete-service-row-btn" data-row-id="${rowId}">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>
  `
  );

  const row = document.getElementById(rowId);
  row.querySelector(".delete-service-row-btn").addEventListener("click", () => {
    row.remove();
    updateSubmissionFinancialSummary();
    autoSaveActivityForm();
  });
  row.querySelectorAll("select, input").forEach(el => {
    el.addEventListener("input", updateSubmissionFinancialSummary);
    el.addEventListener("change", updateSubmissionFinancialSummary);
  });
  updateServiceRowSubtotal(row);
}

function updateServiceRowSubtotal(row) {
  const serviceId = row.querySelector(".service-select").value;
  const count = parseInt(row.querySelector(".service-count-input").value, 10) || 0;
  const hours = parseFloat(row.querySelector(".service-hours-input").value) || 0;
  const service = (appState.settings.services || []).find(s => s.id === serviceId);
  const dateStr = getAggregateEventDates(collectReservationsFromForm()).date_start;
  const rate = service ? getActiveServiceRate(service, dateStr) : 0;
  const hoursInput = row.querySelector(".service-hours-input");
  const isHourly = service && service.type === "hourly";
  hoursInput.style.visibility = isHourly ? "visible" : "hidden";
  const subtotal = isHourly ? rate * hours * count : rate * count;
  row.querySelector(".service-subtotal-display").textContent = formatCurrency(subtotal);
}

// Adds one "autre frais" row (description + montant + compte GL optionnel) to `container`
// (a room card's own .room-fees-list).
function addFeeRow(container, description = "", amount = "", glAccountCode = "", autoGenerated = false) {
  const rowId = generateUid("fee-row");

  container.insertAdjacentHTML(
    "beforeend",
    `
    <div id="${rowId}" class="distribution-row" data-auto-generated="${autoGenerated ? "1" : ""}">
      <input type="text" class="form-input fee-desc-input" value="${description ? description.replace(/"/g, "&quot;") : ""}" placeholder="Ex: Montage et démontage" style="padding: 8px 12px; font-size: 0.85rem;">
      <input type="number" class="form-input fee-amount-input" min="0" step="0.01" value="${amount !== "" ? amount : ""}" placeholder="Montant $" style="padding: 8px 12px; font-size: 0.85rem;">
      <select class="select-input fee-gl-select" style="padding: 8px 12px; font-size: 0.85rem;">
        ${buildGlAccountOptionsHtml(glAccountCode)}
      </select>
      <button type="button" class="btn-icon delete-fee-row-btn" data-row-id="${rowId}">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>
  `
  );

  const row = document.getElementById(rowId);
  row.querySelector(".delete-fee-row-btn").addEventListener("click", () => {
    row.remove();
    updateSubmissionFinancialSummary();
    autoSaveActivityForm();
  });
  row.querySelectorAll("input, select").forEach(el => el.addEventListener("input", updateSubmissionFinancialSummary));
}

// When a room is added to the activity, auto-add its linked staff/fees into that room's own
// (freshly created, empty) card — no duplicate risk since the card was just built.
function autoAddLinkedStaffAndFees(card, roomName) {
  const room = appState.settings.rooms.find(r => r.name === roomName);
  if (!room) return;

  const staffList = card.querySelector(".room-staff-list");
  (room.linked_staff || []).forEach(s => addStaffRow(staffList, s.salary_id, s.count, 0, 0, true));

  const feesList = card.querySelector(".room-fees-list");
  (room.linked_fees || []).forEach(f => addFeeRow(feesList, f.description, f.amount, f.gl_account_code, true));
}

// Collects the Personnel requis rows from one reservation card into an act.reservations[].staff[]-shaped array
function collectStaffFromForm(card) {
  return Array.from(card.querySelectorAll(".room-staff-list .distribution-row"))
    .map(row => ({
      id: row.dataset.id || generateUid("staff"),
      salary_id: row.querySelector(".staff-salary-select").value,
      count: parseInt(row.querySelector(".staff-count-input").value, 10) || 0,
      hours: parseFloat(row.querySelector(".staff-hours-input").value) || 0,
      overtime_hours: parseFloat(row.querySelector(".staff-overtime-hours-input").value) || 0,
      auto_generated: row.dataset.autoGenerated === "1"
    }))
    .filter(s => s.salary_id);
}

// Collects the Services rows from one reservation card into an act.reservations[].services[]-shaped array
function collectServicesFromForm(card) {
  return Array.from(card.querySelectorAll(".room-services-list .distribution-row"))
    .map(row => ({
      id: row.dataset.id || generateUid("service"),
      service_id: row.querySelector(".service-select").value,
      count: parseInt(row.querySelector(".service-count-input").value, 10) || 0,
      hours: parseFloat(row.querySelector(".service-hours-input").value) || 0,
      auto_generated: row.dataset.autoGenerated === "1"
    }))
    .filter(s => s.service_id);
}

// Collects the Autres frais rows from one reservation card into an act.reservations[].fees[]-shaped array
function collectFeesFromForm(card) {
  return Array.from(card.querySelectorAll(".room-fees-list .distribution-row"))
    .map(row => ({
      id: row.dataset.id || generateUid("fee"),
      description: row.querySelector(".fee-desc-input").value.trim(),
      amount: parseFloat(row.querySelector(".fee-amount-input").value) || 0,
      gl_account_code: row.querySelector(".fee-gl-select").value,
      auto_generated: row.dataset.autoGenerated === "1"
    }))
    .filter(f => f.description);
}

// Recomputes and displays the room/personnel/frais subtotal, TPS (5%), TVQ (9.975%), and total
function updateSubmissionFinancialSummary() {
  const container = document.getElementById("submission-financial-summary");
  if (!container) return;

  const reservations = collectReservationsFromForm();
  const roomsTotal = getRoomsTariffTotal({ reservations });
  const eventDateStart = getAggregateEventDates(reservations).date_start;

  let staffTotal = 0;
  document.querySelectorAll("#form-activity-reservations .room-staff-list .distribution-row").forEach(row => {
    updateStaffRowSubtotal(row);
    const salaryId = row.querySelector(".staff-salary-select").value;
    const count = parseInt(row.querySelector(".staff-count-input").value, 10) || 0;
    const hours = parseFloat(row.querySelector(".staff-hours-input").value) || 0;
    const overtimeHours = parseFloat(row.querySelector(".staff-overtime-hours-input").value) || 0;
    const salary = (appState.settings.salaries || []).find(s => s.id === salaryId);
    const rate = salary ? getActiveSalaryRate(salary, eventDateStart) : 0;
    const overtimeRate = salary ? getActiveSalaryOvertimeRate(salary, eventDateStart) : 0;
    staffTotal += rate * hours * count + overtimeRate * overtimeHours * count;
  });

  let servicesTotal = 0;
  document.querySelectorAll("#form-activity-reservations .room-services-list .distribution-row").forEach(row => {
    updateServiceRowSubtotal(row);
    const serviceId = row.querySelector(".service-select").value;
    const count = parseInt(row.querySelector(".service-count-input").value, 10) || 0;
    const hours = parseFloat(row.querySelector(".service-hours-input").value) || 0;
    const service = (appState.settings.services || []).find(s => s.id === serviceId);
    const rate = service ? getActiveServiceRate(service, eventDateStart) : 0;
    servicesTotal += service && service.type === "hourly" ? rate * hours * count : rate * count;
  });

  let feesTotal = 0;
  document.querySelectorAll("#form-activity-reservations .room-fees-list .distribution-row").forEach(row => {
    feesTotal += parseFloat(row.querySelector(".fee-amount-input").value) || 0;
  });

  const subtotal = roomsTotal + staffTotal + servicesTotal + feesTotal;
  const tps = subtotal * 0.05;
  const tvq = subtotal * 0.09975;
  const total = subtotal + tps + tvq;

  container.innerHTML = `
    <div class="financial-summary-row"><span>Location des salles</span><span>${formatCurrency(roomsTotal)}</span></div>
    <div class="financial-summary-row"><span>Personnel</span><span>${formatCurrency(staffTotal)}</span></div>
    <div class="financial-summary-row"><span>Services</span><span>${formatCurrency(servicesTotal)}</span></div>
    <div class="financial-summary-row"><span>Autres frais</span><span>${formatCurrency(feesTotal)}</span></div>
    <div class="financial-summary-row"><span>Sous-total</span><span>${formatCurrency(subtotal)}</span></div>
    <div class="financial-summary-row"><span>TPS (5%)</span><span>${formatCurrency(tps)}</span></div>
    <div class="financial-summary-row"><span>TVQ (9,975%)</span><span>${formatCurrency(tvq)}</span></div>
    <div class="financial-summary-row total"><span>Total</span><span>${formatCurrency(total)}</span></div>
  `;
}

// Generates the next available activity id (XXYY-ZZZ) for the selected fiscal year
function generateNextActivityId() {
  const prefix = appState.selected_year
    .split("-")
    .map(y => y.substring(2))
    .join("");

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
  const nextSeq = String(maxSeq + 1).padStart(3, "0");
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
  document.getElementById("form-activity-coba").value = act.coba || "";
  fillActivityFormFields(act);
  renderActivityStateBar(act);
  deleteBtn.style.display = "inline-flex";

  const submitBtn = document.getElementById("activity-drawer-submit");
  if (submitBtn) {
    submitBtn.style.display = (activitiesState.draftActivityId === id) ? "inline-flex" : "none";
  }

  activitiesState.calendarReturn = calendarReturn;
  document.getElementById("activity-drawer-back-to-calendar-btn").style.display = calendarReturn ? "inline-flex" : "none";

  switchActivityTab("submission");
  updateFormDatesHelper();
  clearDateFieldErrors();

  drawer.classList.add("active");
  backdrop.classList.add("active");

  // Set cursor focus directly on the first editable field (Références COBA)
  setTimeout(() => {
    document.getElementById("form-activity-coba").focus();
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

function cancelActivityDrawer() {
  const id = document.getElementById("form-activity-internal-id").value;
  const nameInput = document.getElementById("form-activity-name");

  if (nameInput && !nameInput.value.trim()) {
    const isDraft = activitiesState.draftActivityId === id;
    if (isDraft) {
      appState.activities = appState.activities.filter(a => a.id !== id);
      activitiesState.draftActivityId = null;
      saveDatabase();
      closeActivityDrawer();
      renderActivities();
      return;
    } else {
      alert("Le nom de l'activité ne peut pas être vide.");
      nameInput.focus();
      return;
    }
  }

  closeActivityDrawer();
}

function addDistributionRow(accountCode = "", amount = 0, reference = "") {
  const container = document.getElementById("form-distribution-list");
  const rowId = "dist-row-" + Date.now() + Math.random().toString(36).substr(2, 5);

  let optionsHtml = '<option value="">Choisir un compte...</option>';
  appState.settings.accounts.forEach(acc => {
    const isSelected = acc.code === accountCode ? "selected" : "";
    optionsHtml += `<option value="${acc.code}" ${isSelected}>${acc.code} (${acc.description})</option>`;
  });

  const rowHtml = `
    <div id="${rowId}" class="distribution-row">
      <select class="select-input dist-account-select" style="padding: 8px 12px; font-size: 0.85rem;">
        ${optionsHtml}
      </select>
      <input type="number" class="form-input dist-amount-input" min="0" step="0.01" value="${amount > 0 ? amount : ""}" placeholder="Montant $" style="padding: 8px 12px; font-size: 0.85rem;">
      <input type="text" class="form-input dist-reference-input" value="${reference ? reference.replace(/"/g, "&quot;") : ""}" placeholder="N° Facture, RI ou Encaissement" style="padding: 8px 12px; font-size: 0.85rem;">
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
    autoSaveActivityForm();
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

let autoSaveTimeoutId = null;

function showAutoSaveStatus(status) {
  const internalId = document.getElementById("form-activity-internal-id").value;
  if (internalId && activitiesState.draftActivityId === internalId) {
    const el = document.getElementById("auto-save-status");
    if (el) el.classList.remove("active");
    return;
  }

  const el = document.getElementById("auto-save-status");
  if (!el) return;

  const spinner = el.querySelector(".auto-save-spinner");
  const text = el.querySelector(".auto-save-text");

  if (autoSaveTimeoutId) {
    clearTimeout(autoSaveTimeoutId);
    autoSaveTimeoutId = null;
  }

  if (status === "saving") {
    el.className = "auto-save-status active saving";
    if (spinner) spinner.style.display = "inline-block";
    if (text) text.textContent = "Enregistrement...";
  } else if (status === "saved") {
    el.className = "auto-save-status active saved";
    if (spinner) spinner.style.display = "none";
    if (text) text.textContent = "Enregistré";

    autoSaveTimeoutId = setTimeout(() => {
      el.classList.remove("active");
    }, 2000);
  }
}

function autoSaveActivityForm() {
  const internalId = document.getElementById("form-activity-internal-id").value;
  if (!internalId) return;

  // Do not auto-save draft activities until they have been saved once manually!
  if (activitiesState.draftActivityId === internalId) {
    return;
  }

  const rawId = document.getElementById("form-activity-id").value.trim();
  const name = document.getElementById("form-activity-name").value.trim();

  // The activity name cannot be empty. If it is, we don't save.
  if (!name) {
    return;
  }

  showAutoSaveStatus("saving");

  const attendeesInput = document.getElementById("form-activity-attendees").value.trim();
  const attendeesCount = parseInt(attendeesInput) || 0;
  const clientFirstName = document.getElementById("form-activity-client-firstname").value.trim();
  const clientLastName = document.getElementById("form-activity-client-lastname").value.trim();
  const clientPhone = document.getElementById("form-activity-client-phone").value.trim();
  const clientEmail = document.getElementById("form-activity-client-email").value.trim();
  const responsable = document.getElementById("form-activity-responsable").value.trim();
  const clientType = document.getElementById("form-activity-client-type").value;
  const description = document.getElementById("form-activity-description").value.trim();
  const coba = document.getElementById("form-activity-coba").value.trim();
  const managerFirstName = document.getElementById("form-activity-manager-firstname").value.trim();
  const managerLastName = document.getElementById("form-activity-manager-lastname").value.trim();
  const managerType = document.getElementById("form-activity-manager-type").value;
  const managerPhone = document.getElementById("form-activity-manager-phone").value.trim();
  const managerEmail = document.getElementById("form-activity-manager-email").value.trim();
  const reservations = collectReservationsFromForm();
  const { date_start: start, date_end: end } = getAggregateEventDates(reservations);
  const dept = document.getElementById("form-activity-dept").value;
  const eventType = document.getElementById("form-activity-event-type").value;
  const eventTypeOther = document.getElementById("form-activity-event-type-other").value.trim();

  // Build distributions array
  const distributions = [];
  document.querySelectorAll(".distribution-row").forEach(row => {
    const acc = row.querySelector(".dist-account-select")?.value;
    const amtStr = row.querySelector(".dist-amount-input")?.value.trim();
    const amt = parseFloat(amtStr) || 0;
    const reference = row.querySelector(".dist-reference-input")?.value.trim();

    if (acc && amt > 0) {
      distributions.push({ account_code: acc, amount: amt, reference });
    }
  });

  const payload = {
    id: rawId,
    mode: getActivityFormMode(),
    coba,
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
    reservations,
    department: dept,
    event_type: eventType,
    event_type_other: eventType === "autre" ? eventTypeOther : "",
    distributions
  };

  const idx = appState.activities.findIndex(a => a.id === internalId);
  if (idx === -1) return;
  appState.activities[idx] = { ...appState.activities[idx], ...payload };

  if (activitiesState.draftActivityId === internalId) {
    activitiesState.draftActivityId = null;
  }

  saveDatabase();

  if (reconciliationState.ledgerTransactions.length > 0) {
    reconcileLedger();
  }

  renderActivities();
  showAutoSaveStatus("saved");
}

function submitActivityForm(e) {
  if (e) e.preventDefault();

  const internalId = document.getElementById("form-activity-internal-id").value;
  const name = document.getElementById("form-activity-name").value.trim();
  if (!name) {
    alert("Le nom de l'activité ne peut pas être vide.");
    return;
  }

  // Clear draft activity state first so autoSaveActivityForm is allowed to save it!
  if (activitiesState.draftActivityId === internalId) {
    activitiesState.draftActivityId = null;
  }

  autoSaveActivityForm();
  closeActivityDrawer();
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

  const { date_start: startVal, date_end: endVal } = getAggregateEventDates(collectReservationsFromForm());
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
