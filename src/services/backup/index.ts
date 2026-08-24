/**
 * backup/index.ts - Barrel re-exporting auto-backup.ts (File System Access API auto-save),
 * validation.ts (restored JSON schema checks), restore.ts (applying a restore), reminder.ts
 * (reminder banner/safety snapshots/diagnostic logs) and ../excel-export.ts (the xlsx report), so
 * existing imports keep working.
 *
 * initBackupHandlers() used to also wire every Sauvegarde & Export button (export JSON/Excel/
 * logs, drop zone, reset DB, reminder-days input) via addEventListener on ids that
 * components/backup/BackupView.tsx (React) already owns and handles itself via onClick/onChange —
 * a duplicate-wiring risk of the same shape fixed elsewhere in this migration (see
 * activities/render.ts's header comment on bulk-actions.ts). In practice most of it was already
 * inert rather than actively conflicting: main.tsx calls initBackupHandlers() once at startup,
 * before BackupView has necessarily mounted (it's only rendered when the user is on that view at
 * all), so document.getElementById() for those ids came back null and the listeners were never
 * attached. Only the pieces that target always-present elements — initAutoBackup() (the
 * auto-backup-reminder-banner) and initDeletedActivitiesModal()/initRestoreActivityPreview()
 * (which set up the deleted-activities/restore-preview modals, still legacy DOM, not owned by any
 * React component) — were doing real work. Trimmed down to just those three; the reset-before-DB
 * wipe safety backup this used to build now lives directly in BackupView.tsx's
 * handleResetDatabase(), since that's the one live code path a click actually reaches.
 */
import { initDeletedActivitiesModal } from "./reminder.ts";
import { initRestoreActivityPreview } from "./restore.ts";
import { initAutoBackup } from "./auto-backup.ts";

function initBackupHandlers() {
  initAutoBackup();
  initDeletedActivitiesModal();
  initRestoreActivityPreview();
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
  renderDeletedActivitiesModalList,
  openDeletedActivitiesModal,
  closeDeletedActivitiesModal,
  restoreDeletedActivity,
  initDeletedActivitiesModal,
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
