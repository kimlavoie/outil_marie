/**
 * backup-reminder.ts - "Have you backed up recently?" banner/badge logic, the list of automatic
 * safety snapshots taken before a destructive operation, and diagnostic log export.
 */
import { appState, getSafetyBackupsFromDb } from "../state/state.ts";
import { logError, getLogHistory } from "../utils/logger.ts";
import { showToast } from "../utils/utils.ts";

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

  if (appState.activities.length === 0) {
    banner.style.display = "none";
    return;
  }

  const lastBackup = appState.settings.last_backup_date;
  const reminderDays = appState.settings.backup_reminder_days || 7;

  if (!lastBackup) {
    alertTextEl.innerHTML = `
      <svg viewBox="0 0 24 24" class="alert-icon" style="fill: var(--warning-text); margin-right: 8px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
      <span>Attention : Aucune sauvegarde de vos données n'a été effectuée.</span>
    `;
    banner.style.display = "flex";
  } else {
    const days = getDaysSinceLastBackup();
    if (days !== null && days >= reminderDays) {
      alertTextEl.innerHTML = `
        <svg viewBox="0 0 24 24" class="alert-icon" style="fill: var(--warning-text); margin-right: 8px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
        <span>Attention : Votre dernière sauvegarde remonte à <strong>${days}</strong> ${days > 1 ? "jours" : "jour"} (limite configurée à ${reminderDays} jours).</span>
      `;
      banner.style.display = "flex";
    } else {
      banner.style.display = "none";
    }
  }
}

function renderBackupView() {
  const lastBackup = appState.settings.last_backup_date;
  const reminderDays = appState.settings.backup_reminder_days || 7;

  // Update date text
  const dateEl = document.getElementById("backup-status-date");
  if (dateEl) {
    dateEl.textContent = lastBackup ? `${formatLocalDateToFrench(lastBackup)} (${lastBackup})` : "Aucune sauvegarde effectuée";
  }

  // Update status badge
  const badgeContainer = document.getElementById("backup-status-badge-container");
  if (badgeContainer) {
    if (appState.activities.length === 0) {
      badgeContainer.innerHTML = `<span class="badge badge-info">Aucune donnée à sauvegarder</span>`;
    } else if (!lastBackup) {
      badgeContainer.innerHTML = `<span class="badge badge-danger">Non sauvegardé</span>`;
    } else {
      const days = getDaysSinceLastBackup();
      if (days !== null && days >= reminderDays) {
        badgeContainer.innerHTML = `<span class="badge badge-warning">Sauvegarde requise</span>`;
      } else {
        badgeContainer.innerHTML = `<span class="badge badge-success">À jour</span>`;
      }
    }
  }

  // Update reminder input value
  const inputEl = document.getElementById("backup-reminder-days-input") as HTMLInputElement | null;
  if (inputEl) {
    inputEl.value = String(reminderDays);
  }

  renderSafetyBackupsList();
}

const SAFETY_BACKUP_LABELS: Record<string, string> = {
  avant_restauration: "Avant restauration d'une sauvegarde",
  avant_reinitialisation: "Avant réinitialisation de la base",
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
  downloadSafetyBackup,
  exportDiagnosticLogs
};
