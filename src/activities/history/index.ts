/**
 * activities/history/index.ts - Form submission and table sort init, plus a barrel re-exporting
 * undo.ts (undo/redo stack), room-conflicts.ts (dates helper + room-booking conflict detection)
 * and version-history.ts (version snapshots/diff/restore) under this shared import path (the same
 * pattern used by src/services/backup/index.ts and src/activities/reservations/index.ts) — split
 * out because the original file mixed those 4 largely independent concerns in one 610-line
 * module.
 *
 * Renders/manipulates the activity drawer/form directly — like js/datepicker.ts,
 * js/activities-file-links.ts, js/activities-render.ts and js/activities-form.ts, this stays a
 * plain TS module rather than a React component until Réservations gets its own turn in Phase 4.
 */
import { requireNonEmpty } from "../../utils/validation.ts";
import { showToast } from "../../utils/utils.ts";
import { activitiesState, renderActivities } from "../render.ts";
import { closeActivityDrawer } from "../drawer.ts";
import { autoSaveActivityForm } from "../autosave.ts";

function submitActivityForm(e?: Event) {
  if (e) e.preventDefault();

  const internalId = (document.getElementById("form-activity-internal-id") as HTMLInputElement).value;
  const name = (document.getElementById("form-activity-name") as HTMLInputElement).value.trim();
  const nameError = requireNonEmpty(name, "Le nom de l'activité ne peut pas être vide.");
  if (nameError) {
    showToast(nameError, "warning");
    return;
  }

  // Clear draft activity state first so autoSaveActivityForm is allowed to save it!
  if (activitiesState.draftActivityId === internalId) {
    activitiesState.draftActivityId = null;
  }

  autoSaveActivityForm();
  closeActivityDrawer();
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
      const sortKey = th.getAttribute("data-sort") || "";
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

export { submitActivityForm, initActivitiesSort };
export {
  scheduleActivityUndoSnapshot,
  pushActivityUndoSnapshot,
  restoreActivitySnapshot,
  undoActivityFormChange,
  redoActivityFormChange
} from "./undo.ts";
export {
  updateFormDatesHelper,
  timeRangesOverlap,
  getReservationOccupiedRanges,
  checkRoomReservationConflicts,
  getDaysOfWeekInRange
} from "./room-conflicts.ts";
export {
  formatTimestampToFrench,
  saveActivityVersion,
  computeActivityDiff,
  loadAndRenderActivityHistory,
  restoreActivityVersion
} from "./version-history.ts";
