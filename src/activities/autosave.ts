/**
 * activities-autosave.ts - Debounced auto-save of the activity form to appState/DB, and the
 * "Enregistrement.../Enregistré" status indicator.
 * Split out of activities-financials.ts (see that file for the rest of the module's history).
 *
 * scheduleActivityUndoSnapshot (defined in activities-history.ts, which itself imports
 * autoSaveActivityForm/activityUndoSnapshotTimer/ACTIVITY_UNDO_DEBOUNCE_MS/setActivityUndoSnapshotTimer
 * from here) is a real import — a circular import between the two, same as the several others
 * already in this codebase: safe since nothing runs during either module's
 * top-level evaluation.
 */
import { appState, saveDatabaseOrRollback } from "../state/state.ts";
import { showToast, elById } from "../utils/utils.ts";
import { isNonEmptyString } from "../utils/validation.ts";
import { activitiesState, renderActivities } from "./render.ts";
import { collectReservationsFromForm, getAggregateEventDates } from "./reservations/index.ts";
import { getIncompleteRowWarnings } from "./reservations/subrows.ts";
import { reconciliationState, reconcileLedger } from "../services/reconciliation.ts";
import { getActivityFormMode, updateFormTabIndicators } from "./form.ts";
import { scheduleActivityUndoSnapshot } from "./history/index.ts";

// The status badge stays visible at all times (never fades out) so the user always has a clear,
// permanent answer to "is my work saved?" instead of having to trust a message that disappears.
function showAutoSaveStatus(status: "saving" | "saved" | "warning", message?: string) {
  const statusEl = elById("auto-save-status");
  if (!statusEl) return;

  const spinner = statusEl.querySelector<HTMLElement>(".auto-save-spinner");
  const text = statusEl.querySelector<HTMLElement>(".auto-save-text");

  const internalId = elById("form-activity-internal-id").value;
  if (internalId && activitiesState.draftActivityId === internalId) {
    statusEl.className = "auto-save-status draft";
    if (spinner) spinner.style.display = "none";
    if (text) text.textContent = "Brouillon (pas encore enregistré)";
    return;
  }

  if (status === "saving") {
    statusEl.className = "auto-save-status saving";
    if (spinner) spinner.style.display = "inline-block";
    if (text) text.textContent = "Enregistrement...";
  } else if (status === "saved") {
    statusEl.className = "auto-save-status saved";
    if (spinner) spinner.style.display = "none";
    if (text) text.textContent = "Enregistré";
  } else if (status === "warning") {
    // Used when autoSaveActivityForm bails out without writing anything (e.g. empty name) so the
    // badge doesn't keep showing a stale "Enregistré" from before the field was cleared — that
    // would tell the user their edits are safe when they're actually not persisted anywhere yet.
    statusEl.className = "auto-save-status warning";
    if (spinner) spinner.style.display = "none";
    if (text) text.textContent = message || "Non enregistré";
  }
}

function autoSaveActivityForm() {
  const internalId = elById("form-activity-internal-id").value;
  if (!internalId) return;

  if (activitiesState.draftActivityId === internalId) {
    return;
  }

  const rawId = elById("form-activity-id").value.trim();
  const name = elById("form-activity-name").value.trim();

  if (!isNonEmptyString(name)) {
    showAutoSaveStatus("warning", "Nom requis — modifications non enregistrées");
    return;
  }

  showAutoSaveStatus("saving");

  const attendeesInput = elById("form-activity-attendees").value.trim();
  const attendeesCount = parseInt(attendeesInput) || 0;
  const responsableSameAsManager = elById("form-activity-responsable-same-as-manager").checked;
  const responsableFirstName = elById("form-activity-responsable-firstname").value.trim();
  const responsableLastName = elById("form-activity-responsable-lastname").value.trim();
  const responsable = [responsableFirstName, responsableLastName].filter(Boolean).join(" ");
  const clientType = elById("form-activity-client-type").value;
  const description = elById("form-activity-description").value.trim();
  const notes = elById("form-activity-notes").value.trim();
  const coba = elById("form-activity-coba").value.trim();
  const managerFirstName = elById("form-activity-manager-firstname").value.trim();
  const managerLastName = elById("form-activity-manager-lastname").value.trim();
  const managerType = elById("form-activity-manager-type").value;
  const managerPhone = elById("form-activity-manager-phone").value.trim();
  const managerEmail = elById("form-activity-manager-email").value.trim();
  const managerCompany = elById("form-activity-manager-company").value.trim();
  const managerCobaClientNumber = elById("form-activity-manager-coba-client-number").value.trim();
  const managerAddress = elById("form-activity-manager-address").value.trim();
  const managerCity = elById("form-activity-manager-city").value.trim();
  const managerProvince = elById("form-activity-manager-province").value.trim();
  const managerPostalCode = elById("form-activity-manager-postal-code").value.trim();
  const reservations = collectReservationsFromForm();
  getIncompleteRowWarnings().forEach(msg => showToast(msg, "warning"));
  const aggregateDates = getAggregateEventDates(reservations);
  const existingActivity = appState.activities.find(a => a.id === internalId);
  // If every slot was removed (reservation kept but emptied), don't let the activity lose its
  // date range silently — keep whatever dates it already had and warn instead.
  const datesCleared = (!aggregateDates.date_start || !aggregateDates.date_end) && existingActivity?.date_start;
  const start = aggregateDates.date_start || existingActivity?.date_start || "";
  const end = aggregateDates.date_end || existingActivity?.date_end || "";
  if (datesCleared) {
    showToast("Aucun créneau restant : les dates de l'activité n'ont pas été modifiées.", "warning");
  }
  const dept = elById("form-activity-dept").value;
  const eventType = elById("form-activity-event-type").value;
  const eventTypeOther = elById("form-activity-event-type-other").value.trim();

  const distributions: any[] = [];
  // A row only makes it into `distributions` when it has both an account and a positive amount
  // (see the `if` below) — anything else is silently dropped from what gets saved. That's fine
  // right after picking an account, before an amount has been typed at all, but if something was
  // typed and it didn't parse into a usable amount (e.g. "0"), the row vanishes from the saved
  // data with no indication, even though it's still sitting there in the form. Warn in that case,
  // mirroring getIncompleteRowWarnings() for reservation rows above.
  document.querySelectorAll("#form-distribution-list .distribution-row").forEach(row => {
    const acc = row.querySelector<HTMLInputElement>(".dist-account-select-wrapper .searchable-select-value")?.value;
    const amtStr = row.querySelector<HTMLInputElement>(".dist-amount-input")?.value.trim() || "";
    const amt = parseFloat(amtStr) || 0;
    const reference = row.querySelector<HTMLInputElement>(".dist-reference-input")?.value.trim();
    const details = row.querySelector<HTMLInputElement>(".dist-details-input")?.value.trim();
    const auto_generated = (row as HTMLElement).dataset.autoGenerated === "1";

    if (acc && amt > 0) {
      distributions.push({ account_code: acc, amount: amt, reference, details, auto_generated });
    } else if (acc && amtStr) {
      showToast("Une ligne de répartition a un montant invalide et n'a pas été enregistrée.", "warning");
    }
  });

  const responsableAddress = elById("form-activity-responsable-address")?.value.trim() || "";
  const responsableCity = elById("form-activity-responsable-city")?.value.trim() || "";
  const responsableProvince = elById("form-activity-responsable-province")?.value.trim() || "";
  const responsablePostalCode = elById("form-activity-responsable-postal-code")?.value.trim() || "";

  const payload = {
    id: rawId,
    mode: getActivityFormMode(),
    coba,
    responsable,
    responsable_first_name: responsableFirstName,
    responsable_last_name: responsableLastName,
    responsable_same_as_manager: responsableSameAsManager,
    name,
    attendees_count: attendeesCount,
    date_start: start,
    date_end: end,
    description,
    notes,
    activity_manager: {
      first_name: managerFirstName,
      last_name: managerLastName,
      type: managerType,
      phone: managerPhone,
      email: managerEmail,
      company_name: managerType === "externe" ? managerCompany : "",
      coba_client_number: managerType === "externe" ? managerCobaClientNumber : "",
      address: managerType === "externe" ? managerAddress : "",
      city: managerType === "externe" ? managerCity : "",
      province: managerType === "externe" ? managerProvince : "",
      postal_code: managerType === "externe" ? managerPostalCode : ""
    },
    client_type: clientType,
    responsable_address: clientType === "externe" ? responsableAddress : "",
    responsable_city: clientType === "externe" ? responsableCity : "",
    responsable_province: clientType === "externe" ? responsableProvince : "",
    responsable_postal_code: clientType === "externe" ? responsablePostalCode : "",
    reservations,
    department: clientType === "externe" ? "" : dept,
    event_type: eventType,
    event_type_other: eventType === "autre" ? eventTypeOther : "",
    distributions
  };

  const idx = appState.activities.findIndex(a => a.id === internalId);
  if (idx === -1) return;
  const previous = appState.activities[idx];
  const prevDraftId = activitiesState.draftActivityId;
  appState.activities[idx] = { ...appState.activities[idx], ...payload };

  if (activitiesState.draftActivityId === internalId) {
    activitiesState.draftActivityId = null;
  }

  saveDatabaseOrRollback(() => {
    appState.activities[idx] = previous;
    activitiesState.draftActivityId = prevDraftId;
  }, "Les modifications n'ont pas été enregistrées. Réessayez.").then(saved => {
    if (!saved) return;

    if (reconciliationState.ledgerTransactions.length > 0) {
      reconcileLedger();
    }

    renderActivities();
    showAutoSaveStatus("saved");
    updateFormTabIndicators(appState.activities[idx]);
  });

  // Any new edit invalidates whatever "future" the redo stack held, but the undo snapshot itself
  // is debounced (see scheduleActivityUndoSnapshot): a burst of saves from one continuous edit
  // (keystrokes, a field's "input" then its "change" on blur, etc.) collapses into a single undo
  // step instead of one step per underlying save.
  activitiesState.redoStack = [];
  scheduleActivityUndoSnapshot(idx);
}

// Groups every autosave from one continuous edit into a single undo step: each call postpones
// the actual push by ACTIVITY_UNDO_DEBOUNCE_MS, so only the last (most complete) state in a burst
// of saves gets recorded. Reads appState.activities[idx] lazily when the timer fires, not the
// value at schedule time, so it always captures the final state of the burst.
let activityUndoSnapshotTimer: ReturnType<typeof setTimeout> | null = null;
const ACTIVITY_UNDO_DEBOUNCE_MS = 800;

// ES modules only give importers a read-only live view of an exported `let` — activities-history.js
// needs to actually reassign activityUndoSnapshotTimer (see scheduleActivityUndoSnapshot), so it
// goes through this setter instead of assigning the imported binding directly.
function setActivityUndoSnapshotTimer(timer: ReturnType<typeof setTimeout> | null) {
  activityUndoSnapshotTimer = timer;
}

export { showAutoSaveStatus, autoSaveActivityForm, activityUndoSnapshotTimer, ACTIVITY_UNDO_DEBOUNCE_MS, setActivityUndoSnapshotTimer };
