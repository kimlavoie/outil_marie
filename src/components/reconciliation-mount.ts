/**
 * reconciliation-mount.ts - Startup wiring + a cross-module refresh signal for the
 * Reconciliation ("Rapprochement GL") view.
 *
 * Used to create a second, detached React root at #validation-root so external mutations of
 * reconciliationState (services/reconciliation.ts) — from navigation/period-selector.ts,
 * activities/bulk-actions.ts, activities/context-menu.ts, services/backup/reminder.ts,
 * state/ui-state.ts, activities/history/undo.ts — could force a re-render via renderReconciliation().
 * But #validation-root was never actually rendered anywhere in the DOM (App.tsx mounts
 * <ReconciliationView /> directly inside its own tree instead), so renderReconciliation() silently
 * did nothing — e.g. changing the fiscal year/quarter while the Reconciliation tab was open didn't
 * refresh its results.
 *
 * Fixed the same way as switchToView/settings' mount.ts: this is now a plain refresh-token store
 * (useSyncExternalStore) that the live <ReconciliationView> instance in App.tsx subscribes to via
 * useReconciliationRefreshToken(), instead of a second root nobody mounts.
 */
import { useSyncExternalStore } from "react";
import { loadReconDecisions } from "../services/reconciliation.ts";
import { showToast } from "../utils/utils.ts";

let refreshToken = 0;
const listeners = new Set<() => void>();

function bump() {
  refreshToken++;
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useReconciliationRefreshToken(): number {
  return useSyncExternalStore(subscribe, () => refreshToken);
}

export function initReconciliationHandlers() {
  loadReconDecisions().then(success => {
    if (!success) {
      showToast(
        "Impossible de charger les décisions de rapprochement précédemment enregistrées. Elles pourraient sembler manquantes.",
        "error"
      );
    }
  });
}

export function renderReconciliation() {
  bump();
}
