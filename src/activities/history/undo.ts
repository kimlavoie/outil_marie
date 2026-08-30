/**
 * activities/history/undo.ts - Undo/redo snapshot stack (Ctrl+Z / Ctrl+Y) for the activity
 * drawer currently open. Split out of index.ts (see that file for why it stays a barrel
 * importing/re-exporting this alongside room-conflicts.ts/version-history.ts).
 */
import { saveDatabaseOrRollback } from "../../state/state.ts";
import { getActivities, getActivityIndex, replaceActivity } from "../../state/activities-repository.ts";
import { showToast } from "../../utils/utils.ts";
import { reconciliationState, reconcileLedger } from "../../services/reconciliation.ts";
import { activitiesState, ACTIVITY_UNDO_HISTORY_LIMIT, renderActivities } from "../render.ts";
import { activityUndoSnapshotTimer, ACTIVITY_UNDO_DEBOUNCE_MS, setActivityUndoSnapshotTimer } from "../autosave.ts";
import { fillActivityFormFields, renderActivityStateBar } from "../form.ts";

// Groups every autosave from one continuous edit into a single undo step (see
// activities-autosave.ts's ACTIVITY_UNDO_DEBOUNCE_MS doc comment for why).
function scheduleActivityUndoSnapshot(idx: number) {
  clearTimeout(activityUndoSnapshotTimer ?? undefined);
  setActivityUndoSnapshotTimer(
    setTimeout(() => {
      const act = getActivities()[idx];
      // Skip if the drawer has since closed or moved on to a different activity.
      const internalIdEl = document.getElementById("form-activity-internal-id") as HTMLInputElement | null;
      if (!act || !internalIdEl || internalIdEl.value !== act.id) return;
      pushActivityUndoSnapshot(act);
    }, ACTIVITY_UNDO_DEBOUNCE_MS)
  );
}

// Records the activity's current state onto the undo stack (Ctrl+Z).
function pushActivityUndoSnapshot(act: any) {
  activitiesState.undoStack.push(JSON.parse(JSON.stringify(act)));
  if (activitiesState.undoStack.length > ACTIVITY_UNDO_HISTORY_LIMIT) {
    activitiesState.undoStack.shift();
  }
}

// Replaces the open activity's record with `snapshot`, then rebuilds the whole form from it
// (same rebuild openActivityDrawer does), without touching the undo/redo stacks themselves.
function restoreActivitySnapshot(snapshot: any) {
  const idx = getActivityIndex(snapshot.id);
  if (idx === -1) return;

  // Cancel any pending debounced snapshot from the edit that's being undone/redone away, so it
  // can't fire afterwards and silently push a stale state back onto the stack.
  clearTimeout(activityUndoSnapshotTimer ?? undefined);

  const previous = getActivities()[idx];
  replaceActivity(snapshot.id, JSON.parse(JSON.stringify(snapshot)));

  const titleEl = document.getElementById("activity-drawer-title");
  if (titleEl) {
    titleEl.textContent =
      getActivities()[idx].name && getActivities()[idx].name.trim() !== ""
        ? getActivities()[idx].name
        : `Activité ${getActivities()[idx].id}`;
  }

  const resContainer = document.getElementById("form-activity-reservations");
  if (resContainer) resContainer.innerHTML = "";

  const distContainer = document.getElementById("form-distribution-list");
  if (distContainer) distContainer.innerHTML = "";

  fillActivityFormFields(getActivities()[idx]);
  renderActivityStateBar(getActivities()[idx]);

  saveDatabaseOrRollback(() => {
    getActivities()[idx] = previous;
    fillActivityFormFields(previous);
    renderActivityStateBar(previous);
  }, "L'annulation/rétablissement n'a pas été enregistré. Réessayez.").then(() => {
    if (reconciliationState.ledgerTransactions.length > 0) {
      reconcileLedger();
    }
    renderActivities();
  });
}

// Ctrl+Z: reverts to the previous auto-saved state of the activity currently open in the drawer.
function undoActivityFormChange() {
  if (activitiesState.undoStack.length <= 1) return;
  const popped = activitiesState.undoStack.pop();
  if (popped) activitiesState.redoStack.push(popped);
  const previous = activitiesState.undoStack[activitiesState.undoStack.length - 1];
  if (previous) restoreActivitySnapshot(previous);
  showToast("Modification annulée.", "info", 2000);
}

// Ctrl+Y / Ctrl+Shift+Z: re-applies a change previously undone.
function redoActivityFormChange() {
  if (activitiesState.redoStack.length === 0) return;
  const next = activitiesState.redoStack.pop();
  if (!next) return;
  activitiesState.undoStack.push(next);
  restoreActivitySnapshot(next);
  showToast("Modification rétablie.", "info", 2000);
}

export { scheduleActivityUndoSnapshot, pushActivityUndoSnapshot, undoActivityFormChange, redoActivityFormChange };
