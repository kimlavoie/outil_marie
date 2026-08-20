/**
 * New activity creation: the name-only "Nouvelle activité"/"Nouvelle estimation" modal, plus the
 * shared record-building helpers used by that modal, the "Estimation" quick button, and
 * duplication. Split out of activities-form.ts (activity drawer form wiring).
 */
import { appState, saveDatabase } from "../state/state.ts";
import { showToast } from "../utils/utils.ts";
import { requireNonEmpty } from "../utils/validation.ts";
import { activitiesState, renderActivities } from "./render.ts";
import { generateNextActivityId, openActivityDrawer } from "./financials.ts";

// Typed shorthand for document.getElementById — see activities-financials.ts's `el` helper doc
// comment for why this cast is needed/safe.
function el<T extends Element = HTMLInputElement>(id: string): T {
  return document.getElementById(id) as unknown as T;
}

import { trapFocus, type FocusTrapController } from "../utils/focus-trap.ts";

let newActivityModalIntent = "soumission";
let newActivityFocusTrap: FocusTrapController | null = null;

export function initNewActivityModal() {
  el("new-activity-modal-close").addEventListener("click", closeNewActivityModal);
  el("new-activity-modal-cancel").addEventListener("click", closeNewActivityModal);
  el("new-activity-modal-submit").addEventListener("click", submitNewActivityForm);
  // The submit button lives outside the <form> (in the modal footer), so pressing Enter in the
  // name field triggers the form's native submit instead of the button's click — catch it here.
  el<HTMLFormElement>("new-activity-form").addEventListener("submit", submitNewActivityForm);
}

export function openNewActivityModal(intent = "soumission") {
  newActivityModalIntent = intent;
  const form = el<HTMLFormElement>("new-activity-form");
  form.reset();
  el("new-activity-modal-title").textContent = intent === "estimation" ? "Nouvelle estimation" : "Nouvelle activité";
  const modal = el("new-activity-modal");
  modal.classList.add("active");
  el("modal-backdrop").classList.add("active");

  if (newActivityFocusTrap) newActivityFocusTrap.deactivate();
  newActivityFocusTrap = trapFocus(modal, { initialFocusEl: el("form-new-activity-name") });
}

export function closeNewActivityModal() {
  if (newActivityFocusTrap) {
    newActivityFocusTrap.deactivate();
    newActivityFocusTrap = null;
  }
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
    responsable_first_name: "",
    responsable_last_name: "",
    responsable_same_as_manager: false,
    name,
    attendees_count: 0,
    date_start: "",
    date_end: "",
    description: "",
    coba: "",
    activity_manager: {
      first_name: "",
      last_name: "",
      type: "employe",
      phone: "",
      email: "",
      company_name: "",
      coba_client_number: "",
      address: "",
      city: "",
      province: "",
      postal_code: ""
    },
    client_type: "",
    responsable_address: "",
    responsable_city: "",
    responsable_province: "",
    responsable_postal_code: "",
    reservations: [],
    department: "",
    event_type: "",
    event_type_other: "",
    distributions: [],
    state: "brouillon",
    mode,
    submission: { file_link_id: "", generated_at: "", sent_at: "" },
    contract: { file_link_id: "", approved_at: "" },
    form: { file_link_id: "", linked_at: "" },
    supporting_docs: { folder_link_id: "", linked_at: "" },
    planning_tasks: [],
    billed_at: "",
    completed_at: "",
    notes: "",
    // Per-activity TPS/TVQ overrides (organismes exonérés, ententes particulières) — null means
    // "use the default rates from Paramètres > Taxes". See tax-override.ts.
    tax_overrides: null as {
      tps?: { mode: "rate" | "amount"; value: number; note: string };
      tvq?: { mode: "rate" | "amount"; value: number; note: string };
    } | null,
    // "Non taxable" checkbox: full TPS/TVQ exemption shortcut, takes priority over tax_overrides.
    non_taxable: false
  };
}

// Builds a brand-new activity record, saves it immediately, and returns its id. Used by the
// "Nouvelle Activité" quick button (mode "soumission").
export function createActivity(name: string, mode = "soumission") {
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
export function createDraftActivity(name: string) {
  const id = generateNextActivityId();
  appState.activities.push(buildNewActivityRecord(id, name, "estimation"));
  activitiesState.draftActivityId = id;
  return id;
}

// Duplicates an existing activity's submission data (rooms, client, services, etc.) under a
// fresh id, resetting the lifecycle fields (state, planning, submission/contract links, billing
// dates) since a duplicate always restarts its own cycle from Brouillon.
export function duplicateActivityAndOpen(sourceId: string) {
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
