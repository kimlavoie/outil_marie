/**
 * Activity drawer chrome shared by every tab: the Estimation/Soumission mode toggle, tab
 * switching, the state bar (badge + planning progress), the per-tab completion indicators, and
 * commitActivityPatch (the save-and-refresh helper used by lifecycle mutations outside the main
 * "Enregistrer" submit). Split out of activities-form.ts (activity drawer form wiring).
 */
import { appState, saveDatabaseOrRollback } from "../state/state.ts";
import { activitiesState, getPlanningProgress, buildProgressBarHtml, getActivityStateBadgeClass, getActivityStateLabel, renderActivities } from "./render.ts";
import { persistDrawerUiState } from "./financials.ts";
import { saveActivityVersion } from "./history.ts";

// Typed shorthand for document.getElementById — see activities-financials.ts's `el` helper doc
// comment for why this cast is needed/safe.
function el<T extends Element = HTMLInputElement>(id: string): T {
  return document.getElementById(id) as unknown as T;
}

/* ==========================================================================
   ACTIVITY RECORD: ESTIMATION / SOUMISSION MODE TOGGLE
   ========================================================================== */

// Applies the mode to the form: toggles the active pill and hides/shows the
// ".estimation-hide" sections (client identification, billing, manager,
// event type, submission/contract file links) that estimation mode skips.
// `locked` disables switching back to estimation once the activity has moved
// past Brouillon (a submitted/approved activity always needs its full data).
export function applyActivityFormMode(mode: string, locked: boolean) {
  const toggle = el("activity-mode-toggle");
  const panel = el("activity-tab-panel-submission");
  toggle.querySelectorAll<HTMLButtonElement>(".pill-toggle").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
    btn.disabled = locked;
  });
  toggle.classList.toggle("locked", locked);
  panel.classList.toggle("mode-estimation", mode === "estimation");
  el("activity-mode-group").style.display = locked ? "none" : "block";
}

export function getActivityFormMode() {
  const activeBtn = document.querySelector<HTMLElement>("#activity-mode-toggle .pill-toggle.active");
  return activeBtn ? activeBtn.dataset.mode : "estimation";
}

export function initActivityModeToggle() {
  el("activity-mode-toggle").addEventListener("click", e => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".pill-toggle");
    if (!btn || btn.disabled) return;
    applyActivityFormMode(btn.dataset.mode || "", false);
  });
}

export function switchActivityTab(tabName: string) {
  document.querySelectorAll(".activity-tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-activity-tab") === tabName);
  });
  document.querySelectorAll(".activity-tab-panel").forEach(panel => {
    panel.classList.toggle("active", panel.id === `activity-tab-panel-${tabName}`);
  });

  // Remember which tab of which activity is open so a reload/reopen can restore it exactly
  // (see financials.ts's persistDrawerUiState/getSavedDrawerUiState, read back in main.ts).
  if (el("activity-drawer").classList.contains("active")) {
    const id = el("form-activity-internal-id").value;
    if (id) persistDrawerUiState(id, tabName);
  }
}

// Renders the state badge + planning progress atop the activity record. Transition buttons
// (Marquer comme Soumise/Approuvée/Facturée/Terminée) are added by the Soumission/Facturation
// tabs once their gating logic exists.
export function renderActivityStateBar(act: any) {
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
  updateFormTabIndicators(act);
}

export function updateFormTabIndicators(act: any) {
  if (!act) return;

  // 1. Formulaire tab
  const formInd = document.getElementById("tab-ind-form");
  if (formInd) {
    const hasForm = !!act.form?.file_link_id;
    formInd.innerHTML = hasForm ? "🟢" : "⚪";
    formInd.title = hasForm ? "Formulaire PDF lié" : "Aucun formulaire lié";
  }

  // 2. Soumission et contrat tab
  const subInd = document.getElementById("tab-ind-submission");
  if (subInd) {
    const mode = act.mode || "estimation";
    const nameFilled = !!act.name?.trim();
    const hasReservations = act.reservations && act.reservations.length > 0;

    let isComplete = false;
    if (mode === "estimation") {
      isComplete = nameFilled && hasReservations;
    } else {
      const managerLastFilled = !!act.activity_manager?.last_name?.trim();
      const managerFirstFilled = !!act.activity_manager?.first_name?.trim();
      isComplete = nameFilled && hasReservations && (managerLastFilled || managerFirstFilled);
    }

    subInd.innerHTML = isComplete ? "🟢" : "🟡";
    subInd.title = isComplete ? "Données complètes" : "Données incomplètes (responsable de l'activité ou réservation manquante)";
  }

  // 3. Planification tab
  const planInd = document.getElementById("tab-ind-planning");
  if (planInd) {
    const progress = getPlanningProgress(act);
    if (progress.total === 0) {
      planInd.innerHTML = "⚪";
      planInd.title = "Aucune tâche de planification";
    } else if (progress.done === progress.total) {
      planInd.innerHTML = "🟢";
      planInd.title = "Toutes les tâches terminées";
    } else {
      planInd.innerHTML = "🟡";
      planInd.title = `${progress.done}/${progress.total} tâches terminées (${progress.percent}%)`;
    }
  }

  // 4. Facturation tab
  const billInd = document.getElementById("tab-ind-billing");
  if (billInd) {
    const isBilled = !!act.billed_at;
    const hasDistributions = act.distributions && act.distributions.length > 0;
    if (isBilled) {
      billInd.innerHTML = "🟢";
      billInd.title = "Facturée";
    } else if (hasDistributions) {
      billInd.innerHTML = "🟡";
      billInd.title = "En attente de facturation (ventilation saisie)";
    } else {
      billInd.innerHTML = "⚪";
      billInd.title = "Non facturée";
    }
  }

  // 5. Notes tab
  const notesInd = document.getElementById("tab-ind-notes");
  if (notesInd) {
    const hasNotes = !!act.notes?.trim();
    notesInd.innerHTML = hasNotes ? "📝" : "";
    notesInd.title = hasNotes ? "Contient des notes" : "Aucune note";
  }

  updateFormAccordionCompletion(act);
}

// Marks each accordion section's summary with a checkmark once all of its fields are filled in.
function setAccordionCheckComplete(checkId: string, complete: boolean) {
  const check = document.getElementById(checkId);
  if (check) check.classList.toggle("complete", complete);
}

function updateFormAccordionCompletion(act: any) {
  const isSoumission = (act.mode || "estimation") !== "estimation";

  const nameFilled = !!act.name?.trim();
  const generalComplete = isSoumission ? nameFilled && !!act.attendees_count && !!act.description?.trim() : nameFilled;
  setAccordionCheckComplete("accordion-check-general", generalComplete);

  const manager = act.activity_manager || {};
  let managerComplete =
    !!manager.first_name?.trim() && !!manager.last_name?.trim() && !!manager.type && !!manager.phone?.trim() && !!manager.email?.trim();
  if (managerComplete && manager.type === "externe") {
    managerComplete =
      !!manager.company_name?.trim() &&
      !!manager.address?.trim() &&
      !!manager.city?.trim() &&
      !!manager.province?.trim() &&
      !!manager.postal_code?.trim();
  }
  setAccordionCheckComplete("accordion-check-manager", managerComplete);

  const billingComplete =
    !!act.responsable_first_name?.trim() && !!act.responsable_last_name?.trim() && !!act.client_type && !!act.department;
  setAccordionCheckComplete("accordion-check-billing", billingComplete);

  const roomsComplete = (act.reservations || []).length > 0;
  setAccordionCheckComplete("accordion-check-rooms", roomsComplete);

  let eventComplete = !!act.event_type;
  if (eventComplete && act.event_type === "autre") {
    eventComplete = !!act.event_type_other?.trim();
  }
  setAccordionCheckComplete("accordion-check-eventtype", eventComplete);
}

// Applies `patchFn` to the activity `id`, persists it, and refreshes the state bar / list —
// for lifecycle mutations (file links, state transitions) that happen outside the main
// "Enregistrer" form submit, so they take effect immediately.
export function commitActivityPatch(id: string, patchFn: (act: any) => void) {
  const idx = appState.activities.findIndex((a: any) => a.id === id);
  if (idx === -1) return;
  const previous = JSON.parse(JSON.stringify(appState.activities[idx]));
  patchFn(appState.activities[idx]);
  saveDatabaseOrRollback(() => {
    appState.activities[idx] = previous;
    renderActivityStateBar(previous);
  }, "La modification n'a pas été enregistrée. Réessayez.").then(saved => {
    if (!saved) {
      renderActivities();
      return;
    }

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
  });
}
