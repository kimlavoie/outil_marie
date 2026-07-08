/**
 * activities-form.ts - Activity drawer form wiring: modal/drawer lifecycle,
 * file link tabs, planning tab, and drawer field population.
 * Part 2/5 of the activities module (see activities-render.ts for context).
 *
 * The activity drawer/form itself isn't yet React (that's Réservations, the last Phase 4 step —
 * addReservationCard/addSlotRow live there and this file calls into them), so like
 * js/datepicker.ts, js/activities-file-links.ts, js/activities-history.ts,
 * js/activities-financials.ts and js/activities-render.ts, this stays a plain TS module.
 */
import { appState, saveDatabase } from "../state/state.ts";
import {
  debounce,
  generateUid,
  maskPhoneInput,
  escapeHtml,
  showToast,
  getReservationRoomLabel,
  OTHER_ROOM_VALUE,
  formatCurrency
} from "../utils/utils.ts";
import { requireNonEmpty } from "../utils/validation.ts";
import {
  activitiesState,
  getPlanningProgress,
  buildProgressBarHtml,
  getActivityStateBadgeClass,
  getActivityStateLabel,
  renderActivities,
  initBulkActionsHandlers
} from "./render.ts";
import {
  generateNextActivityId,
  openActivityDrawer,
  printActivitySheet,
  autoSaveActivityForm,
  cancelActivityDrawer,
  addDistributionRow,
  updateDistributionTotal,
  showAutoSaveStatus,
  updateSubmissionFinancialSummary
} from "./financials.ts";
import {
  undoActivityFormChange,
  redoActivityFormChange,
  loadAndRenderActivityHistory,
  updateFormDatesHelper,
  submitActivityForm,
  saveActivityVersion
} from "./history.ts";
import { renderFileLinkStatus } from "./file-links.ts";
import {
  collectReservationsFromForm,
  getAggregateEventDates,
  addReservationCard,
  addSlotRow,
  initReservationsSection
} from "./reservations.ts";
import { getActiveSalaryRate, getActiveSalaryOvertimeRate, getActiveServiceRate } from "../state/state.ts";

// Typed shorthand for document.getElementById — see activities-financials.ts's `el` helper doc
// comment for why this cast is needed/safe.
function el<T extends Element = HTMLInputElement>(id: string): T {
  return document.getElementById(id) as unknown as T;
}

// activities-render.ts also declares/bridges a `newActivityModalIntent`, but nothing outside this
// file actually reads its live value (checked: only globals.d.ts references the type) — so rather
// than deal with import-binding read-only semantics for a value only this file ever consumes,
// it just keeps its own copy, matching the original's default.
let newActivityModalIntent = "soumission";

function initFormHandlers() {
  initBulkActionsHandlers();
  const backdrop = el("drawer-backdrop");
  const drawer = el("activity-drawer");

  // Open drawers buttons: creating a "soumission" activity only asks for a name first (see
  // initNewActivityModal); "estimation" skips that step and opens the drawer directly on a
  // blank draft, since the drawer's own name field already handles an empty name (see
  // openActivityDrawer()).
  el("add-activity-btn-quick").addEventListener("click", () => openNewActivityModal("soumission"));
  el("add-estimation-btn-quick").addEventListener("click", () => openActivityDrawer(createDraftActivity("")));

  // Close buttons: discard the activity if it was only an in-memory draft (Estimation flow)
  // that was never actually saved via "Enregistrer".
  el("activity-drawer-close").addEventListener("click", cancelActivityDrawer);
  backdrop.addEventListener("click", cancelActivityDrawer);
  el("activity-print-btn").addEventListener("click", printActivitySheet);

  // Undo/Redo (Ctrl+Z / Ctrl+Y, or Ctrl+Shift+Z for redo) while the activity drawer is open
  document.addEventListener("keydown", e => {
    if (!drawer.classList.contains("active")) return;
    const ctrlOrCmd = e.ctrlKey || e.metaKey;
    if (!ctrlOrCmd) return;

    if (e.key === "z" || e.key === "Z") {
      e.preventDefault();
      if (e.shiftKey) redoActivityFormChange();
      else undoActivityFormChange();
    } else if (e.key === "y" || e.key === "Y") {
      e.preventDefault();
      redoActivityFormChange();
    }
  });

  // Activity record tabs (Soumission et contrat / Planification / Facturation / Historique)
  document.querySelectorAll(".activity-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const tabName = btn.getAttribute("data-activity-tab") || "";
      switchActivityTab(tabName);
      if (tabName === "history") {
        const id = el("form-activity-internal-id").value;
        if (id) {
          loadAndRenderActivityHistory(id);
        }
      }
    });
  });

  // Back to calendar button (only visible when opened from the calendar view)
  el("activity-drawer-back-to-calendar-btn").addEventListener("click", () => {
    const calendarReturn = activitiesState.calendarReturn;
    cancelActivityDrawer();
    // calendar-view.tsx isn't imported statically: it's a .tsx (JSX) file, and this module needs
    // to stay importable by plain `node --test` (see js/dashboard-view.tsx's/js/settings-view.tsx's
    // same constraint) — Node can't load .tsx. A dynamic import is only ever resolved when this
    // handler actually runs, so it doesn't affect the test suite's static import graph.
    if (calendarReturn) import("../components/calendar-view.tsx").then(m => m.reopenCalendarModal(calendarReturn));
  });

  // Inputs search
  const resetActivitiesPageAndRender = () => {
    activitiesState.page = 1;
    activitiesState.selectedIds.clear();
    renderActivities();
  };
  // Debounced on the free-text search box only: typing fires an "input" event per
  // keystroke, and each one re-filters/re-sorts/re-renders the whole table.
  // Filter selects fire one discrete "change" event per interaction, so they stay immediate.
  el("activity-search").addEventListener("input", debounce(resetActivitiesPageAndRender, 250));
  el("filter-salle").addEventListener("change", resetActivitiesPageAndRender);
  el("filter-client-type").addEventListener("change", resetActivitiesPageAndRender);
  el("filter-status").addEventListener("change", resetActivitiesPageAndRender);

  // Account distributions buttons
  el("form-add-distribution-btn").addEventListener("click", () => {
    addDistributionRow("", 0);
    autoSaveActivityForm();
  });

  // Submit Button (only for draft activities/estimations)
  const submitBtn = el("activity-drawer-submit");
  if (submitBtn) {
    submitBtn.addEventListener("click", submitActivityForm);
  }

  // Auto-save form-level inputs and changes
  const activityForm = el("activity-form");
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

  // Dates helper updates: recompute whenever any créneau's date/time changes. The actual
  // autosave isn't triggered here — #form-activity-reservations is inside #activity-form, so
  // these input/change events already bubble up to the listeners registered on activityForm
  // above; calling autoSaveActivityForm() again here would double-save (and double-push an undo
  // snapshot) for every keystroke in a reservation field.
  const reservationsContainer = el("form-activity-reservations");
  reservationsContainer.addEventListener("input", () => {
    updateFormDatesHelper();
    updateSubmissionFinancialSummary();
  });
  reservationsContainer.addEventListener("change", () => {
    updateFormDatesHelper();
    updateSubmissionFinancialSummary();
  });

  // Note: Personnel requis / Services / Autres frais buttons are wired per reservation card in
  // addReservationCard(), since each réservation has its own set of rows.

  // Planification tab buttons
  el("generate-planning-tasks-btn").addEventListener("click", () => {
    const id = el("form-activity-internal-id").value;
    const act = appState.activities.find(a => a.id === id);
    if (act) generatePlanningTasks(act);
  });
  el("add-planning-task-btn").addEventListener("click", () => {
    addPlanningTaskRow({ id: generateUid("task"), description: "", done: false, auto_generated: false });
  });

  // Facturation tab button
  el("generate-billing-lines-btn").addEventListener("click", () => {
    const id = el("form-activity-internal-id").value;
    const act = appState.activities.find(a => a.id === id);
    if (act) generateBillingLines(act);
  });

  // Phone number masks
  maskPhoneInput(el("form-activity-manager-phone"));
  maskPhoneInput(el("form-activity-client-phone"));

  // Estimation / Soumission mode toggle
  initActivityModeToggle();

  // "+ Ajouter une réservation" button
  initReservationsSection();

  // Note: Services techniques / Service de bar / Autres services pill groups are wired
  // per reservation card in addReservationCard(), since each réservation has its own set of fields.

  // Event type "Autre" reveals a free-text field
  el("form-activity-event-type").addEventListener("change", e => {
    const otherGroup = el("form-activity-event-type-other-group");
    otherGroup.style.display = (e.target as HTMLInputElement).value === "autre" ? "flex" : "none";
  });

  // Keyboard Shortcuts: Navigation, Add, and Escape
  window.addEventListener("keydown", e => {
    // Alt + [1-6] for switching tabs
    if (e.altKey && e.key >= "1" && e.key <= "6") {
      e.preventDefault();
      const views = ["dashboard", "activities", "validation", "account-report", "settings", "backup"];
      const targetView = views[parseInt(e.key) - 1];
      if (targetView) {
        const navBtn = document.querySelector<HTMLButtonElement>(`.nav-item[data-view="${targetView}"] button`);
        if (navBtn) navBtn.click();
      }
    }

    // Alt + N or Alt + A to open the new activity modal
    if (e.altKey && (e.key.toLowerCase() === "n" || e.key.toLowerCase() === "a")) {
      e.preventDefault();
      openNewActivityModal();
    }

    // Alt + E for a new estimation, same behavior as the "add-estimation-btn-quick" button
    // (skips the name modal, opens the drawer directly on a blank draft)
    if (e.altKey && e.key.toLowerCase() === "e") {
      e.preventDefault();
      openActivityDrawer(createDraftActivity(""));
    }

    // Escape to close drawers and modals
    if (e.key === "Escape") {
      cancelActivityDrawer();
      closeNewActivityModal();
      // Settings' 6 modals became React state (see js/settings-view.tsx) when that view was
      // converted; this replaces the old vanilla closeSettingsModal(type) calls, which had
      // silently stopped doing anything (closeSettingsModal no longer existed) and only ever
      // covered 4 of the 6 modals anyway. Dynamic import for the same .tsx/node --test reason as
      // reopenCalendarModal above.
      import("../components/settings/view.tsx").then(m => m.closeAllSettingsModals());
    }
  });
}

/* ==========================================================================
   NEW ACTIVITY MODAL (name-only creation)
   ========================================================================== */

function initNewActivityModal() {
  el("new-activity-modal-close").addEventListener("click", closeNewActivityModal);
  el("new-activity-modal-cancel").addEventListener("click", closeNewActivityModal);
  el("new-activity-modal-submit").addEventListener("click", submitNewActivityForm);
  // The submit button lives outside the <form> (in the modal footer), so pressing Enter in the
  // name field triggers the form's native submit instead of the button's click — catch it here.
  el<HTMLFormElement>("new-activity-form").addEventListener("submit", submitNewActivityForm);
}

function openNewActivityModal(intent = "soumission") {
  newActivityModalIntent = intent;
  const form = el<HTMLFormElement>("new-activity-form");
  form.reset();
  el("new-activity-modal-title").textContent = intent === "estimation" ? "Nouvelle estimation" : "Nouvelle activité";
  el("new-activity-modal").classList.add("active");
  el("modal-backdrop").classList.add("active");
  setTimeout(() => el("form-new-activity-name").focus(), 150);
}

function closeNewActivityModal() {
  el("new-activity-modal").classList.remove("active");
  el("modal-backdrop").classList.remove("active");
}

function submitNewActivityForm(e: Event) {
  e.preventDefault();
  const name = el("form-new-activity-name").value.trim();
  const nameError = requireNonEmpty(name, "Veuillez saisir le nom de l'activité.");
  if (nameError) {
    showToast(nameError, "warning");
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
function buildNewActivityRecord(id: string, name: string, mode: string) {
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
    form: { file_link_id: "", linked_at: "" },
    planning_tasks: [],
    billed_at: "",
    completed_at: "",
    notes: ""
  };
}

// Builds a brand-new activity record, saves it immediately, and returns its id. Used by the
// "Nouvelle Activité" quick button (mode "soumission").
function createActivity(name: string, mode = "soumission") {
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
function createDraftActivity(name: string) {
  const id = generateNextActivityId();
  appState.activities.push(buildNewActivityRecord(id, name, "estimation"));
  activitiesState.draftActivityId = id;
  return id;
}

// Duplicates an existing activity's submission data (rooms, client, services, etc.) under a
// fresh id, resetting the lifecycle fields (state, planning, submission/contract links, billing
// dates) since a duplicate always restarts its own cycle from Brouillon.
function duplicateActivityAndOpen(sourceId: string) {
  const source = appState.activities.find((a: any) => a.id === sourceId);
  if (!source) return;

  const clone = JSON.parse(JSON.stringify(source));
  clone.id = generateNextActivityId();
  clone.state = "brouillon";
  clone.planning_tasks = [];
  clone.submission = { file_link_id: "", generated_at: "", sent_at: "" };
  clone.contract = { file_link_id: "", approved_at: "" };
  clone.form = { file_link_id: "", linked_at: "" };
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
function applyActivityFormMode(mode: string, locked: boolean) {
  const toggle = el("activity-mode-toggle");
  const panel = el("activity-tab-panel-submission");
  toggle.querySelectorAll<HTMLButtonElement>(".pill-toggle").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
    btn.disabled = locked;
  });
  toggle.classList.toggle("locked", locked);
  panel.classList.toggle("mode-estimation", mode === "estimation");
  el("activity-mode-locked-hint").style.display = locked ? "block" : "none";
}

function getActivityFormMode() {
  const activeBtn = document.querySelector<HTMLElement>("#activity-mode-toggle .pill-toggle.active");
  return activeBtn ? activeBtn.dataset.mode : "estimation";
}

function initActivityModeToggle() {
  el("activity-mode-toggle").addEventListener("click", e => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".pill-toggle");
    if (!btn || btn.disabled) return;
    applyActivityFormMode(btn.dataset.mode || "", false);
  });
}

function switchActivityTab(tabName: string) {
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
function renderActivityStateBar(act: any) {
  const bar = el("activity-state-bar");
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
function commitActivityPatch(id: string, patchFn: (act: any) => void) {
  const idx = appState.activities.findIndex((a: any) => a.id === id);
  if (idx === -1) return;
  patchFn(appState.activities[idx]);
  saveDatabase();
  renderActivityStateBar(appState.activities[idx]);
  renderActivities();

  // Save version on lifecycle patch and update the open snapshot to match
  const updatedAct = appState.activities[idx];
  saveActivityVersion(updatedAct).then(() => {
    // If the drawer is currently open on this activity, update the initial snapshot to match this new state
    const currentOpenId = el("form-activity-internal-id").value;
    if (currentOpenId === id) {
      activitiesState.openedActivitySnapshot = JSON.parse(JSON.stringify(updatedAct));
    }
  });
}

/* ==========================================================================
   PLANIFICATION TAB (task checklist, auto-generation, progress)
   ========================================================================== */

function renderPlanningTab(act: any) {
  el("planning-tasks-list").innerHTML = "";
  (act.planning_tasks || []).forEach((t: any) => addPlanningTaskRow(t));
  updatePlanningProgressDisplay(act);
  el("generate-planning-tasks-btn").disabled = (act.planning_tasks || []).length > 0;
}

function addPlanningTaskRow(task: any) {
  const container = el("planning-tasks-list");
  const rowId = generateUid("task-row");
  const doneStyle = task.done ? "text-decoration: line-through; color: var(--text-muted);" : "";

  container.insertAdjacentHTML(
    "beforeend",
    `
    <div id="${rowId}" class="distribution-row" data-task-id="${task.id}" data-auto-generated="${task.auto_generated ? "1" : ""}" style="grid-template-columns: auto 1fr auto; align-items: center;">
      <input type="checkbox" id="${rowId}-done" class="task-done-checkbox" ${task.done ? "checked" : ""}>
      <input type="text" id="${rowId}-desc" class="form-input task-desc-input" value="${escapeHtml(task.description)}" placeholder="Description de la tâche" style="padding: 8px 12px; font-size: 0.85rem; ${doneStyle}">
      <button type="button" class="btn-icon delete-task-row-btn" data-row-id="${rowId}">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>
  `
  );

  const row = el(rowId);
  const descInput = row.querySelector<HTMLInputElement>(".task-desc-input")!;
  const checkbox = row.querySelector<HTMLInputElement>(".task-done-checkbox")!;

  row.querySelector(".delete-task-row-btn")!.addEventListener("click", () => {
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
  return Array.from(document.querySelectorAll<HTMLElement>("#planning-tasks-list .distribution-row"))
    .map(row => ({
      id: row.dataset.taskId || generateUid("task"),
      description: row.querySelector<HTMLInputElement>(".task-desc-input")!.value.trim(),
      done: row.querySelector<HTMLInputElement>(".task-done-checkbox")!.checked,
      auto_generated: row.dataset.autoGenerated === "1"
    }))
    .filter(t => t.description);
}

function updatePlanningProgressDisplay(act: any) {
  const progress = getPlanningProgress(act);
  el("planning-progress-bar-container").innerHTML = buildProgressBarHtml(progress.percent);
  el("planning-progress-label").textContent =
    progress.total > 0 ? `${progress.done}/${progress.total} tâches (${progress.percent}%)` : "Aucune tâche";
}

// Persists the current task list immediately (planning is a live checklist, not gated behind
// the main "Enregistrer" button) and auto-advances the state to Planifiée once every task is
// done — but never downgrades a state that has already moved past Planifiée.
function persistPlanningTasks() {
  const id = el("form-activity-internal-id").value;
  if (!id) return;
  const tasks = collectPlanningTasksFromForm();

  commitActivityPatch(id, (act: any) => {
    act.planning_tasks = tasks;
    const progress = getPlanningProgress(act);
    if (progress.total > 0 && progress.done === progress.total && (act.state === "soumise" || act.state === "approuvee")) {
      act.state = "planifiee";
    }
  });

  const updated = appState.activities.find((a: any) => a.id === id);
  updatePlanningProgressDisplay(updated);
  el("generate-planning-tasks-btn").disabled = (updated.planning_tasks || []).length > 0;
}

// Derives the planning checklist from the Soumission tab's data: one room-reservation task per
// réservation (naming any linked rooms that come along with it), a personnel-reservation task per
// réservation that has staff attached, one task per linked "tâche du gestionnaire" on that room's
// config, and one task per configured global task (Configuration > Tâches globales).
function generatePlanningTasks(act: any) {
  if ((act.planning_tasks || []).length > 0) return;

  const tasks: any[] = [];
  (act.reservations || []).forEach((r: any) => {
    const roomLabel = getReservationRoomLabel(r);
    const roomConfig = r.room_name === OTHER_ROOM_VALUE ? null : appState.settings.rooms.find((rc: any) => rc.name === r.room_name);
    const linkedNames = roomConfig ? roomConfig.linked_rooms || [] : [];
    const reserveDesc = linkedNames.length
      ? `Réserver la salle ${roomLabel} (et salles liées : ${linkedNames.join(", ")}) dans le logiciel officiel`
      : `Réserver la salle ${roomLabel} dans le logiciel officiel`;
    tasks.push({ id: generateUid("task"), description: reserveDesc, done: false, auto_generated: true });

    const hasStaffForRoom = (r.staff || []).length > 0;
    if (hasStaffForRoom) {
      tasks.push({ id: generateUid("task"), description: `Réserver le personnel pour ${roomLabel}`, done: false, auto_generated: true });
    }

    (roomConfig ? roomConfig.linked_tasks || [] : []).forEach((lt: any) => {
      tasks.push({ id: generateUid("task"), description: lt.description, done: false, auto_generated: true });
    });
  });

  (appState.settings.global_tasks || []).forEach((gt: any) => {
    tasks.push({ id: generateUid("task"), description: gt.description, done: false, auto_generated: true });
  });

  commitActivityPatch(act.id, (a: any) => {
    a.planning_tasks = tasks;
  });
  renderPlanningTab(appState.activities.find((a: any) => a.id === act.id));
}

/* ==========================================================================
   FACTURATION TAB (GL distribution auto-population, Facturée/Terminée)
   ========================================================================== */

// Builds distribution rows (account_code/amount/reference) from whichever room parameters,
// personnel jobs, and autres frais already carry a configured GL account — items without one
// are left out so the user adds/maps them manually, consistent with the existing distribution
// row validation (an amount without a selected account blocks saving).
function generateBillingLines(act: any) {
  if (
    (act.distributions || []).length > 0 &&
    !confirm("Des lignes de facturation existent déjà. Les remplacer par les lignes générées automatiquement ?")
  ) {
    return;
  }

  el("form-distribution-list").innerHTML = "";

  const reservations = collectReservationsFromForm();
  const eventDateStart = getAggregateEventDates(reservations).date_start;

  reservations.forEach((r: any) => {
    if (r.tariff_gl_account_code && r.tariff_amount > 0) {
      const days = r.slots.length;
      const details = `Location salle ${r.room_name} - ${days} jour${days > 1 ? "s" : ""} à ${formatCurrency(r.tariff_amount)}`;
      addDistributionRow(r.tariff_gl_account_code, r.tariff_amount * days, "", details);
    }
  });

  document.querySelectorAll<HTMLElement>("#form-activity-reservations .room-staff-list .distribution-row").forEach(row => {
    const salaryId = row.querySelector<HTMLInputElement>(".staff-salary-select")!.value;
    const salary = ((appState.settings.salaries as any[]) || []).find((s: any) => s.id === salaryId);
    if (!salary || !salary.gl_account_code) return;
    const count = parseInt(row.querySelector<HTMLInputElement>(".staff-count-input")!.value, 10) || 0;
    const hours = parseFloat(row.querySelector<HTMLInputElement>(".staff-hours-input")!.value) || 0;
    const overtimeHours = parseFloat(row.querySelector<HTMLInputElement>(".staff-overtime-hours-input")!.value) || 0;
    const rate = getActiveSalaryRate(salary, eventDateStart);
    const overtimeRate = getActiveSalaryOvertimeRate(salary, eventDateStart);
    const amount = rate * hours * count + overtimeRate * overtimeHours * count;
    if (amount > 0) {
      let details = `${count} ${salary.job}${count > 1 ? "s" : ""} de ${hours}h à ${formatCurrency(rate)}/h`;
      if (overtimeHours > 0) {
        details += ` + ${overtimeHours}h sup. à ${formatCurrency(overtimeRate)}/h`;
      }
      addDistributionRow(salary.gl_account_code, amount, "", details);
    }
  });

  document.querySelectorAll<HTMLElement>("#form-activity-reservations .room-services-list .distribution-row").forEach(row => {
    const serviceId = row.querySelector<HTMLInputElement>(".service-select")!.value;
    const service = ((appState.settings.services as any[]) || []).find((s: any) => s.id === serviceId);
    const tarifId = row.querySelector<HTMLSelectElement>(".service-tarif-select")!.value;
    const tarif = service && ((service.tarifs as any[]) || []).find((t: any) => t.id === tarifId);
    const glAccountCode = tarif ? tarif.gl_account_code : "";
    if (!service || !tarif || !glAccountCode) return;
    const count = parseInt(row.querySelector<HTMLInputElement>(".service-count-input")!.value, 10) || 0;
    const hours = parseFloat(row.querySelector<HTMLInputElement>(".service-hours-input")!.value) || 0;
    const rate = getActiveServiceRate(service, eventDateStart, tarifId);
    const isHourly = service.type === "hourly";
    const amount = isHourly ? rate * hours * count : rate * count;
    if (amount > 0) {
      const details = isHourly
        ? `${count} x ${service.name} de ${hours}h à ${formatCurrency(rate)}/h`
        : `${count} x ${service.name} à ${formatCurrency(rate)}`;
      addDistributionRow(glAccountCode, amount, "", details);
    }
  });

  document.querySelectorAll<HTMLElement>("#form-activity-reservations .room-fees-list .distribution-row").forEach(row => {
    const glCode = row.querySelector<HTMLInputElement>(".fee-gl-select")!.value;
    const amount = parseFloat(row.querySelector<HTMLInputElement>(".fee-amount-input")!.value) || 0;
    const description = row.querySelector<HTMLInputElement>(".fee-desc-input")?.value.trim() || "";
    if (glCode && amount > 0) addDistributionRow(glCode, amount, "", description);
  });

  if (document.querySelectorAll("#form-distribution-list .distribution-row").length === 0) {
    addDistributionRow("", 0);
  }
  updateDistributionTotal();
}

// Renders the Facturée/Terminée billing dates and gated transition buttons
function renderBillingStateStatus(act: any) {
  const container = el("billing-state-status");
  if (!container) return;

  container.innerHTML = `
    ${act.billed_at ? `<span style="color: var(--text-muted);">Facturée le ${act.billed_at}</span>` : ""}
    ${act.completed_at ? `<span style="color: var(--text-muted);">Terminée le ${act.completed_at}</span>` : ""}
    <button type="button" id="mark-billed-btn" class="btn btn-primary">Marquer comme Facturée</button>
    <button type="button" id="mark-completed-btn" class="btn btn-primary">Marquer comme Terminée</button>
  `;

  const billBtn = container.querySelector<HTMLButtonElement>("#mark-billed-btn")!;
  billBtn.addEventListener("click", () => {
    commitActivityPatch(act.id, (a: any) => {
      a.state = "facturee";
      a.billed_at = new Date().toISOString().split("T")[0];
    });
    renderBillingStateStatus(appState.activities.find((a: any) => a.id === act.id));
  });

  const completeBtn = container.querySelector<HTMLButtonElement>("#mark-completed-btn")!;
  completeBtn.addEventListener("click", () => {
    commitActivityPatch(act.id, (a: any) => {
      a.state = "terminee";
      a.completed_at = new Date().toISOString().split("T")[0];
    });
    renderBillingStateStatus(appState.activities.find((a: any) => a.id === act.id));
  });
}

// Fills the activity form fields (everything except the id/internal-id keys)
// from an existing activity object. Used by both Edit Mode and Duplicate Mode.
function fillActivityFormFields(act: any) {
  applyActivityFormMode(act.mode || "estimation", act.state !== "brouillon");
  el("form-activity-coba").value = act.coba || "";
  el("form-activity-name").value = act.name;
  el("form-activity-attendees").value = act.attendees_count || "";
  el("form-activity-client-firstname").value = act.client?.first_name || "";
  el("form-activity-client-lastname").value = act.client?.last_name || "";
  el("form-activity-client-phone").value = act.client?.phone || "";
  el("form-activity-client-email").value = act.client?.email || "";
  el("form-activity-responsable").value = act.responsable;
  el("form-activity-client-type").value = act.client_type;
  el("form-activity-description").value = act.description || "";
  el("form-activity-notes").value = act.notes || "";
  el("form-activity-manager-firstname").value = act.activity_manager?.first_name || "";
  el("form-activity-manager-lastname").value = act.activity_manager?.last_name || "";
  el("form-activity-manager-type").value = act.activity_manager?.type || "employe";
  el("form-activity-manager-phone").value = act.activity_manager?.phone || "";
  el("form-activity-manager-email").value = act.activity_manager?.email || "";
  el("form-activity-reservations").innerHTML = "";
  (act.reservations || []).forEach((r: any) => addReservationCard(r));
  // A brand-new activity starts with one réservation and one créneau pre-filled, so the user
  // doesn't have to click "+ Ajouter une réservation" just to get going.
  if ((act.reservations || []).length === 0) {
    const card = addReservationCard();
    addSlotRow(card!.querySelector(".reservation-slots-list") as HTMLElement);
  }
  updateFormDatesHelper();
  el("form-activity-dept").value = act.department;
  el("form-activity-event-type").value = act.event_type || "";
  el("form-activity-event-type-other").value = act.event_type_other || "";
  el("form-activity-event-type-other-group").style.display = act.event_type === "autre" ? "flex" : "none";

  // Load distributions
  (act.distributions || []).forEach((d: any) => {
    addDistributionRow(d.account_code, d.amount, d.reference, d.details);
  });

  renderFileLinkStatus("form", act);
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

export {
  initFormHandlers,
  initNewActivityModal,
  createActivity,
  createDraftActivity,
  duplicateActivityAndOpen,
  getActivityFormMode,
  switchActivityTab,
  renderActivityStateBar,
  commitActivityPatch,
  fillActivityFormFields,
  WEEKDAY_PILL_OPTIONS
};
