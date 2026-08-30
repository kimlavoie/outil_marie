/**
 * backup/reminder.ts - "Have you backed up recently?" banner/badge logic, the list of automatic
 * safety snapshots taken before a destructive operation, and diagnostic log export.
 */
import { appState, getSafetyBackupsFromDb, saveDatabaseOrRollback } from "../../state/state.ts";
import { getActivities, getActivityById } from "../../state/activities-repository.ts";
import { logError, getLogHistory } from "../../utils/logger.ts";
import { showToast, escapeHtml } from "../../utils/utils.ts";
import { parseLocalDateStr } from "../../state/date-helpers.ts";

// Backup reminder helpers and views
function getDaysSinceLastBackup(): number | null {
  if (!appState.settings.last_backup_date) {
    return null;
  }
  const parts = appState.settings.last_backup_date.split("-");
  if (parts.length !== 3) return null;

  const lastBackupDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  const today = new Date();

  // Set both to midnight local time
  lastBackupDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const diffMs = today.getTime() - lastBackupDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffDays;
}

function formatLocalDateToFrench(dateStr: string): string {
  if (!dateStr) return "Aucune sauvegarde effectuée";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

  return `${day} ${months[monthIdx]} ${year}`;
}

function checkBackupReminder() {
  const banner = document.getElementById("backup-reminder-banner");
  const alertTextEl = document.getElementById("backup-alert-text");
  if (!banner || !alertTextEl) return;

  if (getActivities().length === 0) {
    banner.style.display = "none";
    return;
  }

  const lastBackup = appState.settings.last_backup_date;
  const reminderDays = appState.settings.backup_reminder_days || 7;

  if (!lastBackup) {
    alertTextEl.innerHTML = `
      <svg viewBox="0 0 24 24" class="alert-icon" width="20" height="20" style="fill: var(--warning-text); flex-shrink: 0; margin-right: 8px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
      <span>Attention : Aucune sauvegarde de vos données n'a été effectuée.</span>
    `;
    banner.style.display = "flex";
  } else {
    const days = getDaysSinceLastBackup();
    if (days !== null && days >= reminderDays) {
      alertTextEl.innerHTML = `
        <svg viewBox="0 0 24 24" class="alert-icon" width="20" height="20" style="fill: var(--warning-text); flex-shrink: 0; margin-right: 8px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
        <span>Attention : Votre dernière sauvegarde remonte à <strong>${days}</strong> ${days > 1 ? "jours" : "jour"} (limite configurée à ${reminderDays} jours).</span>
      `;
      banner.style.display = "flex";
    } else {
      banner.style.display = "none";
    }
  }
}

// Only refreshes the safety-backups list now. The date/status-badge/reminder-input it used to
// also write into (#backup-status-date, #backup-status-badge-container,
// #backup-reminder-days-input) are all real React-controlled elements in
// components/backup/BackupView.tsx, driven directly off appState via useAppState — writing into
// them here just fought that on every call, and lost every time BackupView itself next
// re-rendered (e.g. right after any backup, since nothing re-ran this function to "fix" it back).
// getDaysSinceLastBackup()/formatLocalDateToFrench() stay exported: BackupView.tsx computes the
// same badge/date directly from them.
function renderBackupView() {
  renderSafetyBackupsList();
}

// Soft-deleted activities (see appState.activities[].deleted) so a user who removed one by
// mistake can bring it back without restoring an entire JSON backup. Activities are only flagged
// `deleted`, never physically removed from appState (see src/activities/context-menu.ts and
// src/activities/bulk-actions.ts), so restoring is just clearing that flag. Kept behind a modal
// (opened from the "Voir les activités supprimées" button) with a search box instead of an inline
// list, since that list has no upper bound over the life of the app.
function getDeletedActivities() {
  return getActivities().filter((a: any) => a.deleted);
}

function formatActivityDateLabel(act: any): string {
  if (!act.date_start) return "";
  try {
    return ` — ${parseLocalDateStr(act.date_start).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" })}`;
  } catch {
    return "";
  }
}

function renderDeletedActivitiesModalList(searchTerm = "") {
  const container = document.getElementById("deleted-activities-modal-list");
  if (!container) return;

  const query = searchTerm.trim().toLowerCase();
  const deletedActivities = getDeletedActivities().filter((act: any) => {
    if (!query) return true;
    const name = act.name && act.name.trim() !== "" ? act.name : "Activité sans nom";
    return name.toLowerCase().includes(query) || String(act.id).toLowerCase().includes(query);
  });

  if (deletedActivities.length === 0) {
    container.innerHTML = `<span style="font-size: 0.85rem; color: var(--text-secondary)">${
      query ? "Aucune activité supprimée ne correspond à la recherche." : "Aucune activité supprimée pour le moment."
    }</span>`;
    return;
  }

  container.innerHTML = "";
  deletedActivities.forEach((act: any) => {
    const row = document.createElement("div");
    row.style.cssText =
      "display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 10px; border: 1px solid var(--border-color); border-radius: var(--radius-sm);";

    const label = document.createElement("button");
    label.type = "button";
    label.style.cssText =
      "background: none; border: none; padding: 0; font-size: 0.85rem; text-align: left; cursor: pointer; color: var(--text-primary); flex: 1;";
    const name = act.name && act.name.trim() !== "" ? act.name : "Activité sans nom";
    label.innerHTML = `${escapeHtml(name)}${escapeHtml(formatActivityDateLabel(act))}`;
    label.title = "Voir l'aperçu de l'activité";
    label.addEventListener("click", () => previewDeletedActivity(act.id));
    row.appendChild(label);

    const btn = document.createElement("button");
    btn.className = "btn btn-secondary";
    btn.textContent = "Restaurer";
    btn.style.cssText = "padding: 4px 10px; font-size: 0.8rem; flex-shrink: 0;";
    btn.addEventListener("click", () => restoreDeletedActivity(act.id));
    row.appendChild(btn);

    container.appendChild(row);
  });
}

function ensureDeletedActivitiesModalExists() {
  let modal = document.getElementById("deleted-activities-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "deleted-activities-modal";
    modal.className = "modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "deleted-activities-modal-title");
    modal.innerHTML = `
      <div class="modal-header">
        <h3 class="modal-title" id="deleted-activities-modal-title">Activités supprimées</h3>
        <button id="deleted-activities-modal-close" type="button" class="btn-icon" aria-label="Fermer">
          <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>
      <div class="modal-content" style="display: flex; flex-direction: column; gap: 16px; max-height: 60vh; overflow-y: auto;">
        <div>
          <input type="text" id="deleted-activities-search" class="form-input" placeholder="Rechercher une activité supprimée..." style="width: 100%;" />
        </div>
        <div id="deleted-activities-modal-list" style="display: flex; flex-direction: column; gap: 8px;"></div>
      </div>
      <div class="modal-footer">
        <button id="deleted-activities-modal-close-btn" type="button" class="btn btn-secondary">Fermer</button>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById("deleted-activities-modal-close")?.addEventListener("click", closeDeletedActivitiesModal);
    document.getElementById("deleted-activities-modal-close-btn")?.addEventListener("click", closeDeletedActivitiesModal);

    const searchInput = document.getElementById("deleted-activities-search") as HTMLInputElement | null;
    searchInput?.addEventListener("input", () => renderDeletedActivitiesModalList(searchInput.value));
  }

  if (!document.getElementById("modal-backdrop")) {
    const backdrop = document.createElement("div");
    backdrop.id = "modal-backdrop";
    backdrop.className = "modal-backdrop";
    document.body.appendChild(backdrop);
  }
}

function openDeletedActivitiesModal(preserveSearch?: string) {
  ensureDeletedActivitiesModalExists();
  const modal = document.getElementById("deleted-activities-modal");
  const backdrop = document.getElementById("modal-backdrop");
  const searchInput = document.getElementById("deleted-activities-search") as HTMLInputElement | null;
  if (!modal || !backdrop) return;

  if (searchInput) searchInput.value = preserveSearch || "";
  renderDeletedActivitiesModalList(preserveSearch || "");
  modal.classList.add("active");
  backdrop.classList.add("active");
}

function closeDeletedActivitiesModal() {
  document.getElementById("deleted-activities-modal")?.classList.remove("active");
  document.getElementById("modal-backdrop")?.classList.remove("active");
}

// Set right before closing the deleted-activities modal to open the activity details preview, and
// consumed by the details modal's close buttons (see initDeletedActivitiesModal below) to reopen
// the deleted-activities modal instead of leaving the user back at the bare backup view. Only
// consumed once, so closing the details modal when it was opened any other way is unaffected.
let returnToDeletedModalAfterPreview: string | null = null;

// Preview reuses the existing read-only "Voir les détails" modal (see
// src/activities/print-sheet.ts) rather than a bespoke view — it already renders a full activity
// summary and doesn't care whether the activity is flagged deleted. Both modals share the same
// #modal-backdrop, so the deleted-activities modal is closed first to avoid stacking them; closing
// the details modal afterwards reopens the deleted-activities modal (see
// returnToDeletedModalAfterPreview above).
async function previewDeletedActivity(id: string) {
  const searchInput = document.getElementById("deleted-activities-search") as HTMLInputElement | null;
  returnToDeletedModalAfterPreview = searchInput?.value || "";
  closeDeletedActivitiesModal();
  const { openActivityDetailsModal } = await import("../../activities/financials.ts");
  openActivityDetailsModal(id);
}

function handleActivityDetailsModalClosed() {
  if (returnToDeletedModalAfterPreview === null) return;
  const preservedSearch = returnToDeletedModalAfterPreview;
  returnToDeletedModalAfterPreview = null;
  openDeletedActivitiesModal(preservedSearch);
}

async function restoreDeletedActivity(id: string) {
  const target = getActivityById(id);
  if (!target) return;

  target.deleted = false;
  const saved = await saveDatabaseOrRollback(() => {
    target.deleted = true;
  }, "La restauration n'a pas été enregistrée. Réessayez.");

  if (saved) {
    showToast("Activité restaurée.", "success");
    const searchInput = document.getElementById("deleted-activities-search") as HTMLInputElement | null;
    renderDeletedActivitiesModalList(searchInput?.value || "");
    const { reconciliationState, reconcileLedger } = await import("../reconciliation.ts");
    if (reconciliationState.ledgerTransactions.length > 0) {
      reconcileLedger();
    }
    const { renderAll } = await import("../../navigation.ts");
    renderAll();
  }
}

function initDeletedActivitiesModal() {
  ensureDeletedActivitiesModalExists();
  document.getElementById("backup-open-deleted-activities")?.addEventListener("click", () => openDeletedActivitiesModal());

  // Reopens the deleted-activities modal after the activity details preview is closed, but only
  // when it was opened from there (see returnToDeletedModalAfterPreview above) — these two
  // buttons also close the details modal when opened normally (e.g. "Voir les détails" on a
  // non-deleted activity row), where this is a no-op.
  document.getElementById("activity-details-modal-close")?.addEventListener("click", handleActivityDetailsModalClosed);
  document.getElementById("activity-details-modal-close-btn")?.addEventListener("click", handleActivityDetailsModalClosed);
}

const SAFETY_BACKUP_LABELS: Record<string, string> = {
  avant_restauration: "Avant restauration d'une sauvegarde",
  avant_reinitialisation: "Avant réinitialisation de la base",
  avant_facturation_auto: "Avant génération automatique de facturation",
  migration: "Avant mise à jour du format des données"
};

// Lists the automatic snapshots taken right before a destructive operation (restore, reset,
// startup migration) so they aren't invisible to the user. Each one can be downloaded as a
// normal JSON file and brought back through the existing "Restauration des Données" drop zone —
// reusing that flow instead of a separate restore path keeps this to one code path for actually
// applying a backup.
async function renderSafetyBackupsList() {
  const container = document.getElementById("safety-backups-list");
  if (!container) return;

  let records: any[] = [];
  try {
    records = await getSafetyBackupsFromDb();
  } catch (e) {
    logError("backup", "lecture des sauvegardes de sécurité", e);
  }

  if (records.length === 0) {
    container.innerHTML = `<span style="font-size: 0.85rem; color: var(--text-secondary)">Aucune sauvegarde de sécurité pour le moment.</span>`;
    return;
  }

  container.innerHTML = "";
  records.forEach(r => {
    const row = document.createElement("div");
    row.style.cssText = "display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem; gap: 12px;";

    const label = document.createElement("span");
    const dt = new Date(r.timestamp);
    label.textContent = `${SAFETY_BACKUP_LABELS[r.label] || r.label} — ${dt.toLocaleString("fr-CA")}`;
    row.appendChild(label);

    const btn = document.createElement("button");
    btn.className = "btn btn-secondary";
    btn.textContent = "Télécharger";
    btn.style.cssText = "padding: 4px 10px; font-size: 0.8rem;";
    btn.addEventListener("click", () => downloadSafetyBackup(r));
    row.appendChild(btn);

    container.appendChild(row);
  });
}

function downloadSafetyBackup(record: any) {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(record.snapshot, null, 2));
  const a = document.createElement("a");
  a.setAttribute("href", dataStr);
  const timestamp = record.timestamp.replace(/[:.]/g, "-");
  a.setAttribute("download", `compta_marie_securite_${record.label}_${timestamp}.json`);
  a.click();
}

// Downloads the in-memory log history (see src/utils/logger.ts) as a JSON file, so a user
// facing an issue can hand it over without opening dev tools (F12).
function exportDiagnosticLogs() {
  const history = getLogHistory();
  if (history.length === 0) {
    showToast("Aucun journal de diagnostic à exporter pour le moment.", "info");
    return;
  }
  const dataStr = "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(history, null, 2));
  const a = document.createElement("a");
  a.setAttribute("href", dataStr);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  a.setAttribute("download", `compta_marie_journaux_${timestamp}.json`);
  a.click();
  showToast("Journaux de diagnostic téléchargés.", "success");
}

export {
  getDaysSinceLastBackup,
  formatLocalDateToFrench,
  checkBackupReminder,
  renderBackupView,
  renderSafetyBackupsList,
  renderDeletedActivitiesModalList,
  openDeletedActivitiesModal,
  closeDeletedActivitiesModal,
  restoreDeletedActivity,
  initDeletedActivitiesModal,
  downloadSafetyBackup,
  exportDiagnosticLogs
};
