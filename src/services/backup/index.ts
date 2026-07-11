/**
 * backup/index.ts - Backup/restore (JSON) and Excel export controllers: wires up the
 * Sauvegarde & Export view's DOM handlers. Split into auto-backup.ts (File System Access API
 * auto-save), validation.ts (restored JSON schema checks), restore.ts (applying a restore),
 * reminder.ts (reminder banner/safety snapshots/diagnostic logs) and ../excel-export.ts
 * (the xlsx report) — this file re-exports all of them so existing imports keep working.
 */
import { logError } from "../../utils/logger.ts";
import { appState, saveDatabase, saveSafetyBackupToDb, seedDatabase } from "../../state/state.ts";
import { showToast } from "../../utils/utils.ts";
import { exportToExcel } from "../excel-export.ts";
import { handleJsonBackupFile } from "./restore.ts";
import { checkBackupReminder, renderBackupView, renderSafetyBackupsList, exportDiagnosticLogs } from "./reminder.ts";
import { initAutoBackup, connectAutoBackupFile, reconnectAutoBackupPermission, disconnectAutoBackup } from "./auto-backup.ts";

function initBackupHandlers() {
  // Export JSON Backup
  document.getElementById("backup-export-json")?.addEventListener("click", async () => {
    // Update last backup date to today before export
    appState.settings.last_backup_date = new Date().toISOString().split("T")[0];
    await saveDatabase();

    // Refresh banner and backup view
    checkBackupReminder();
    renderBackupView();

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState, null, 2));
    const dlAnchorElem = document.createElement("a");
    dlAnchorElem.setAttribute("href", dataStr);

    const timestamp = new Date().toISOString().split("T")[0];
    dlAnchorElem.setAttribute("download", `compta_marie_sauvegarde_${timestamp}.json`);
    dlAnchorElem.click();
    showToast("Sauvegarde réussie.", "success");
  });

  // Backup file selection drag & drop
  const jsonDropZone = document.getElementById("json-drop-zone");
  const jsonFileInput = document.getElementById("json-file-input") as HTMLInputElement | null;

  if (jsonDropZone && jsonFileInput) {
    jsonDropZone.addEventListener("click", () => jsonFileInput.click());

    jsonFileInput.addEventListener("change", e => {
      const files = (e.target as HTMLInputElement).files;
      const file = files ? files[0] : null;
      if (file) handleJsonBackupFile(file);
    });

    jsonDropZone.addEventListener("dragover", e => {
      e.preventDefault();
      jsonDropZone.classList.add("dragover");
    });

    jsonDropZone.addEventListener("dragleave", () => {
      jsonDropZone.classList.remove("dragover");
    });

    jsonDropZone.addEventListener("drop", e => {
      e.preventDefault();
      jsonDropZone.classList.remove("dragover");
      const file = e.dataTransfer?.files[0];
      if (file) handleJsonBackupFile(file);
    });
  }

  // Export Excel
  document.getElementById("backup-export-excel")?.addEventListener("click", () => {
    exportToExcel();
  });

  // Export diagnostic logs
  document.getElementById("backup-export-logs")?.addEventListener("click", () => {
    exportDiagnosticLogs();
  });

  // Reset database button
  document.getElementById("backup-reset-db")?.addEventListener("click", async () => {
    if (
      confirm(
        "ATTENTION : Cette action va supprimer définitivement toutes vos activités enregistrées. Les comptes, tarifs de salles et départements seront réinitialisés à leurs valeurs d'origine. Voulez-vous continuer ?"
      )
    ) {
      try {
        await saveSafetyBackupToDb("avant_reinitialisation", JSON.parse(JSON.stringify(appState)));
      } catch (err) {
        logError("backup", "sauvegarde de sécurité avant réinitialisation", err);
      }
      renderSafetyBackupsList();

      await seedDatabase();
      const { applyTheme, renderAll } = await import("../../navigation.ts");
      applyTheme("dark");
      renderAll();
      checkBackupReminder();
      showToast("La base de données a été réinitialisée avec succès !", "success");
    }
  });

  // Reminder days input event handler
  const reminderInput = document.getElementById("backup-reminder-days-input") as HTMLInputElement | null;
  if (reminderInput) {
    reminderInput.addEventListener("change", e => {
      let val = parseInt((e.target as HTMLInputElement).value, 10);
      if (isNaN(val) || val < 1) {
        val = 7;
        (e.target as HTMLInputElement).value = "7";
      }
      appState.settings.backup_reminder_days = val;
      saveDatabase();
      checkBackupReminder();
      renderBackupView();
    });
  }

  // Backup banner action redirect
  const bannerActionBtn = document.getElementById("backup-banner-action-btn");
  if (bannerActionBtn) {
    bannerActionBtn.addEventListener("click", () => {
      import("../../navigation.ts").then(m => m.switchToView("backup"));
    });
  }

  // Automatic file backup controls (event delegation: buttons are re-rendered)
  const autoBackupContainer = document.getElementById("auto-backup-status");
  if (autoBackupContainer) {
    autoBackupContainer.addEventListener("click", e => {
      const target = e.target as HTMLElement;
      if (target.id === "auto-backup-connect-btn") connectAutoBackupFile();
      else if (target.id === "auto-backup-reconnect-btn") reconnectAutoBackupPermission();
      else if (target.id === "auto-backup-disconnect-btn") disconnectAutoBackup();
    });
  }
  initAutoBackup();

  // Global banner "Reconnecter" button (visible on every view)
  const autoBackupBannerBtn = document.getElementById("auto-backup-reminder-btn");
  if (autoBackupBannerBtn) {
    autoBackupBannerBtn.addEventListener("click", () => {
      reconnectAutoBackupPermission();
    });
  }
}

export { validateBackupSchema } from "./validation.ts";
export { exportToExcel } from "../excel-export.ts";
export { handleJsonBackupFile } from "./restore.ts";
export {
  getDaysSinceLastBackup,
  formatLocalDateToFrench,
  checkBackupReminder,
  renderBackupView,
  renderSafetyBackupsList,
  downloadSafetyBackup,
  exportDiagnosticLogs
} from "./reminder.ts";
export {
  openAutoBackupDb,
  idbGetAutoBackupHandle,
  idbSetAutoBackupHandle,
  idbClearAutoBackupHandle,
  renderAutoBackupStatus,
  updateAutoBackupBanner,
  initAutoBackup,
  connectAutoBackupFile,
  reconnectAutoBackupPermission,
  disconnectAutoBackup,
  scheduleAutoBackupWrite,
  writeAutoBackupNow
} from "./auto-backup.ts";
export { initBackupHandlers };
