/**
 * activities/bulk-actions.ts - The floating bulk-actions bar (select-all, clear selection, bulk
 * delete, bulk state change) shown once one or more activity rows are checked. Split out of
 * render.ts (see that file for why it stays a barrel re-exporting this alongside
 * context-menu.ts).
 *
 * Imports activitiesState/renderActivities back from render.ts — a real circular import, safe
 * since nothing runs during either module's top-level evaluation, same as the other circular
 * imports already in this codebase (e.g. utils.ts <-> state.ts).
 */
import { appState, saveDatabase } from "../state/state.ts";
import { showToast } from "../utils/utils.ts";
import { reconciliationState, reconcileLedger } from "../services/reconciliation.ts";
import { closeActivityContextMenu } from "./context-menu.ts";
import { activitiesState } from "./activities-table-state.ts";
import { renderActivities } from "./render.ts";
import type { Activity } from "../types/activity.ts";

// Typed shorthand for document.getElementById in this file's DOM-manipulation code — see
// activities-financials.ts's `el` helper doc comment for why this cast is needed/safe.
function el<T extends Element = HTMLInputElement>(id: string): T {
  return document.getElementById(id) as unknown as T;
}

function updateBulkActionsBar() {
  const bar = el("bulk-actions-bar");
  const countSpan = el("bulk-selected-count");
  const selectAllCheckbox = el("activities-select-all");

  const selectedCount = activitiesState.selectedIds.size;

  if (selectedCount > 0) {
    if (bar) {
      bar.classList.add("visible");
    }
    if (countSpan) {
      countSpan.textContent = `${selectedCount} activité${selectedCount > 1 ? "s" : ""} sélectionnée${selectedCount > 1 ? "s" : ""}`;
    }
  } else {
    if (bar) {
      bar.classList.remove("visible");
    }
  }

  // Update the select-all checkbox state based on visible rows
  if (selectAllCheckbox) {
    const checkboxes = document.querySelectorAll<HTMLInputElement>(".activity-select-checkbox");
    if (checkboxes.length > 0) {
      const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
      if (checkedCount === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
      } else if (checkedCount === checkboxes.length) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
      } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
      }
    } else {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    }
  }
}

function initBulkActionsHandlers() {
  const selectAllCheckbox = el("activities-select-all");
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener("change", e => {
      const checkboxes = document.querySelectorAll<HTMLInputElement>(".activity-select-checkbox");
      const isChecked = (e.target as HTMLInputElement).checked;
      checkboxes.forEach(cb => {
        const id = cb.getAttribute("data-id");
        if (!id) return;
        cb.checked = isChecked;
        if (isChecked) {
          activitiesState.selectedIds.add(id);
          cb.closest("tr")!.classList.add("selected");
        } else {
          activitiesState.selectedIds.delete(id);
          cb.closest("tr")!.classList.remove("selected");
        }
      });
      updateBulkActionsBar();
    });
  }

  // Clear selections button
  const clearBtn = el("bulk-clear-btn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      activitiesState.selectedIds.clear();
      renderActivities();
    });
  }

  // Delete bulk button
  const deleteBtn = el("bulk-delete-btn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      const count = activitiesState.selectedIds.size;
      if (count === 0) return;
      if (!confirm(`Voulez-vous vraiment supprimer les ${count} activités sélectionnées ?`)) return;

      const ids = new Set(activitiesState.selectedIds);
      const touched: { act: Activity; prevDeleted?: boolean }[] = [];
      const prevFavorites = appState.favorites ? [...appState.favorites] : [];

      ids.forEach(id => {
        const act = appState.activities.find(a => a.id === id);
        if (act) {
          touched.push({ act, prevDeleted: act.deleted });
          act.deleted = true;
        }
      });
      appState.favorites = (appState.favorites || []).filter(f => !ids.has(f));

      const saved = await saveDatabase();
      if (!saved) {
        // Roll back the in-memory change so the UI doesn't show a deletion that was never
        // persisted — otherwise it would silently revert on the next reload.
        touched.forEach(({ act, prevDeleted }) => {
          act.deleted = prevDeleted;
        });
        appState.favorites = prevFavorites;
        showToast("La suppression n'a pas été enregistrée. Réessayez.", "error", 8000);
        return;
      }

      activitiesState.selectedIds.clear();
      if (reconciliationState.ledgerTransactions.length > 0) {
        reconcileLedger();
      }
      import("../navigation.ts").then(m => m.renderAll());
    });
  }

  // State bulk dropdown toggle
  const stateBtn = el("bulk-state-btn");
  const stateMenu = el("bulk-state-menu");
  if (stateBtn && stateMenu) {
    stateBtn.addEventListener("click", e => {
      e.stopPropagation();
      stateMenu.classList.toggle("hidden");
    });
  }

  // State menu items
  document.querySelectorAll(".bulk-state-item").forEach(item => {
    item.addEventListener("click", async e => {
      const newState = item.getAttribute("data-state") || "";
      const count = activitiesState.selectedIds.size;
      if (count === 0) return;

      const touched: { act: Activity; prevState: string }[] = [];
      activitiesState.selectedIds.forEach(id => {
        const act = appState.activities.find(a => a.id === id);
        if (act) {
          touched.push({ act, prevState: act.state });
          act.state = newState;
        }
      });

      const saved = await saveDatabase();
      if (stateMenu) {
        stateMenu.classList.add("hidden");
      }
      if (!saved) {
        // Roll back so the UI doesn't show a state change that was never persisted.
        touched.forEach(({ act, prevState }) => {
          act.state = prevState;
        });
        showToast("Le changement d'état n'a pas été enregistré. Réessayez.", "error", 8000);
        import("../navigation.ts").then(m => m.renderAll());
        return;
      }

      activitiesState.selectedIds.clear();
      import("../navigation.ts").then(m => m.renderAll());
    });
  });

  // Close dropdown on click outside
  document.addEventListener("click", e => {
    const stateMenu = el("bulk-state-menu");
    const stateBtn = el("bulk-state-btn");
    if (stateMenu && stateBtn && !stateBtn.contains(e.target as Node) && !stateMenu.contains(e.target as Node)) {
      stateMenu.classList.add("hidden");
    }
  });

  // Close the activity row context menu when clicking outside of it, scrolling, or pressing Escape
  document.addEventListener("click", e => {
    const menu = document.getElementById("activity-context-menu");
    if (menu && !menu.contains(e.target as Node)) {
      closeActivityContextMenu();
    }
  });
  document.addEventListener("scroll", () => closeActivityContextMenu(), true);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeActivityContextMenu();
  });
}

export { updateBulkActionsBar, initBulkActionsHandlers };
