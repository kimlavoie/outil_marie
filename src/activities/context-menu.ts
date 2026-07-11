/**
 * activities/context-menu.ts - Right-click context menu for an activity row (favorite, open in
 * new tab, view details, duplicate, delete). Split out of render.ts (see that file for why it
 * stays a barrel re-exporting this alongside bulk-actions.ts) to save horizontal space instead of
 * a dedicated "Actions" column.
 *
 * Imports renderActivities/activitiesState back from render.ts — a real circular import, safe
 * since nothing runs during either module's top-level evaluation, same as the other circular
 * imports already in this codebase (e.g. utils.ts <-> state.ts).
 */
import { appState, isFavoriteActivity, toggleFavoriteActivity, saveDatabaseOrRollback } from "../state/state.ts";
import { reconciliationState, reconcileLedger } from "../services/reconciliation.ts";
import { openActivityDetailsModal } from "./financials.ts";
import { duplicateActivityAndOpen } from "./form.ts";
import { renderActivities } from "./render.ts";

function closeActivityContextMenu() {
  const existing = document.getElementById("activity-context-menu");
  if (existing) existing.remove();
}

function showActivityContextMenu(e: MouseEvent, id: string) {
  closeActivityContextMenu();

  const act = appState.activities.find((a: any) => a.id === id);
  if (!act) return;
  const isFilled = act.name.trim() !== "";

  const items: { label: string; danger?: boolean; onClick: () => void }[] = [];

  if (isFilled) {
    items.push({
      label: isFavoriteActivity(id) ? "Retirer des accès rapides" : "Ajouter aux accès rapides",
      onClick: () => {
        toggleFavoriteActivity(id);
        renderActivities();
        // Dynamic import: navigation.js pulls in the .tsx views (Paramètres/Tableau de bord/...),
        // and this module must stay importable by plain `node --test` (Node can't load .tsx).
        import("../navigation.ts").then(m => m.renderQuickAccessAll());
      }
    });
    items.push({
      label: "Ouvrir dans un nouvel onglet",
      onClick: () => {
        const url = new URL(window.location.href);
        url.search = `?activity=${encodeURIComponent(id)}`;
        window.open(url.toString(), "_blank");
      }
    });
    items.push({
      label: "Voir les détails",
      onClick: () => openActivityDetailsModal(id)
    });
    items.push({
      label: "Dupliquer",
      onClick: () => duplicateActivityAndOpen(id)
    });
  }

  items.push({
    label: "Supprimer",
    danger: true,
    onClick: () => {
      if (confirm(`Voulez-vous vraiment supprimer l'activité ${id} ?`)) {
        const target = appState.activities.find((a: any) => a.id === id);
        const prevDeleted = target?.deleted;
        const prevFavorites = appState.favorites ? [...appState.favorites] : [];
        if (target) {
          target.deleted = true;
        }
        appState.favorites = (appState.favorites || []).filter((f: any) => f !== id);
        saveDatabaseOrRollback(
          () => {
            if (target) target.deleted = prevDeleted;
            appState.favorites = prevFavorites;
          },
          "La suppression n'a pas été enregistrée. Réessayez."
        ).then(() => {
          if (reconciliationState.ledgerTransactions.length > 0) {
            reconcileLedger();
          }
          import("../navigation.ts").then(m => m.renderAll());
        });
      }
    }
  });

  const menu = document.createElement("div");
  menu.id = "activity-context-menu";
  menu.className = "row-actions-menu";
  menu.style.position = "fixed";
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;

  items.forEach(item => {
    const btn = document.createElement("button");
    btn.className = `row-actions-item${item.danger ? " danger" : ""}`;
    btn.textContent = item.label;
    btn.addEventListener("click", ev => {
      ev.stopPropagation();
      closeActivityContextMenu();
      item.onClick();
    });
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);

  // Clamp menu position so it doesn't overflow the viewport
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = `${Math.max(0, window.innerWidth - rect.width - 8)}px`;
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = `${Math.max(0, window.innerHeight - rect.height - 8)}px`;
  }
}

export { closeActivityContextMenu, showActivityContextMenu };
