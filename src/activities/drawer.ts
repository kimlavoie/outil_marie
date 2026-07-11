/**
 * activities-drawer.ts - Activity drawer open/close/cancel lifecycle, the drawer's last-open-tab
 * persistence, and activity id generation.
 * Split out of activities-financials.ts (see that file for the rest of the module's history).
 *
 * updateFormDatesHelper/saveActivityVersion (both defined in activities-history.ts, which itself
 * imports closeActivityDrawer from here) are real imports — a circular import between the two,
 * same as the several others already in this codebase: safe since nothing runs
 * during either module's top-level evaluation.
 */
import { clearDateFieldErrors } from "./datepicker.ts";
import { appState, saveDatabaseOrRollback, recordActivityView } from "../state/state.ts";
import { showToast, elById } from "../utils/utils.ts";
import { activitiesState, renderActivities } from "./render.ts";
import { fillActivityFormFields, renderActivityStateBar, switchActivityTab } from "./form.ts";
import { updateFormDatesHelper, saveActivityVersion } from "./history/index.ts";
import { activityUndoSnapshotTimer } from "./autosave.ts";

// Persists which activity record (and which of its tabs) is currently open in the drawer, so
// reloading/reopening the app can drop the user back exactly where they left off. Kept in its own
// localStorage key (rather than folded into state.ts's saveUiState/UI_STATE_KEY) since it's read
// once at startup by main.ts before the activities view even exists, not re-derived from the DOM
// on every render like the activities list filters are.
const DRAWER_UI_KEY = "outil_marie_drawer_ui";

function persistDrawerUiState(id: string, tab: string) {
  localStorage.setItem(DRAWER_UI_KEY, JSON.stringify({ id, tab }));
}

function clearDrawerUiState() {
  localStorage.removeItem(DRAWER_UI_KEY);
}

function getSavedDrawerUiState(): { id: string; tab: string } | null {
  try {
    const raw = localStorage.getItem(DRAWER_UI_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

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
function openActivityDrawer(id: string, calendarReturn: any = null) {
  const drawer = elById("activity-drawer");
  const backdrop = elById("drawer-backdrop");
  const form = elById<HTMLFormElement>("activity-form");
  const titleEl = elById("activity-drawer-title");

  const act = appState.activities.find((a: any) => a.id === id);
  if (!act) return;

  clearTimeout(activityUndoSnapshotTimer ?? undefined);
  activitiesState.openedActivitySnapshot = JSON.parse(JSON.stringify(act));
  activitiesState.undoStack = [JSON.parse(JSON.stringify(act))];
  activitiesState.redoStack = [];

  if (act.name.trim() !== "") {
    recordActivityView(act.id);
    // Dynamic import: navigation.js pulls in the .tsx views, and this module must stay
    // importable by plain `node --test` (Node can't load .tsx).
    import("../navigation.ts").then(m => m.renderQuickAccessAll());
  }

  form.reset();
  elById("form-distribution-list").innerHTML = "";
  elById("form-distribution-total-val").textContent = "0,00 $";

  titleEl.textContent = act.name.trim() !== "" ? act.name : `Activité ${act.id}`;
  elById("form-activity-internal-id").value = act.id;
  elById("form-activity-id").value = act.id;
  elById("form-activity-id").disabled = true;
  elById("form-activity-coba").value = act.coba || "";
  fillActivityFormFields(act);
  renderActivityStateBar(act);

  const submitBtn = elById("activity-drawer-submit");
  if (submitBtn) {
    submitBtn.style.display = activitiesState.draftActivityId === id ? "inline-flex" : "none";
  }

  activitiesState.calendarReturn = calendarReturn;
  elById("activity-drawer-back-to-calendar-btn").style.display = calendarReturn ? "inline-flex" : "none";

  drawer.classList.add("active");
  backdrop.classList.add("active");

  switchActivityTab("submission");
  updateFormDatesHelper();
  clearDateFieldErrors();

  setTimeout(() => {
    elById("form-activity-coba").focus();
  }, 150);
}

function openActivityDetailModal(id: string, calendarReturn: any) {
  openActivityDrawer(id, calendarReturn);
}

function closeActivityDrawer() {
  const currentId = elById("form-activity-internal-id").value;
  if (currentId) {
    const currentAct = appState.activities.find((a: any) => a.id === currentId);
    const snapshot = activitiesState.openedActivitySnapshot;
    if (currentAct && snapshot && currentAct.id === snapshot.id) {
      if (JSON.stringify(currentAct) !== JSON.stringify(snapshot)) {
        saveActivityVersion(currentAct);
      }
    }
  }
  clearTimeout(activityUndoSnapshotTimer ?? undefined);
  activitiesState.openedActivitySnapshot = null;
  activitiesState.undoStack = [];
  activitiesState.redoStack = [];
  clearDrawerUiState();

  elById("activity-drawer").classList.remove("active");
  elById("drawer-backdrop").classList.remove("active");
}

function cancelActivityDrawer() {
  const id = elById("form-activity-internal-id").value;
  const nameInput = elById("form-activity-name");

  if (nameInput && !nameInput.value.trim()) {
    const isDraft = activitiesState.draftActivityId === id;
    if (isDraft) {
      const prevActivities = appState.activities;
      const prevDraftId = activitiesState.draftActivityId;
      appState.activities = appState.activities.filter(a => a.id !== id);
      activitiesState.draftActivityId = null;
      saveDatabaseOrRollback(() => {
        appState.activities = prevActivities;
        activitiesState.draftActivityId = prevDraftId;
      }, "L'annulation n'a pas été enregistrée. Réessayez.").then(() => {
        closeActivityDrawer();
        renderActivities();
      });
      return;
    } else {
      showToast("Le nom de l'activité ne peut pas être vide.", "warning");
      nameInput.focus();
      return;
    }
  }

  closeActivityDrawer();
}

export {
  generateNextActivityId,
  openActivityDrawer,
  openActivityDetailModal,
  closeActivityDrawer,
  cancelActivityDrawer,
  persistDrawerUiState,
  clearDrawerUiState,
  getSavedDrawerUiState
};
