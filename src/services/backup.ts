/**
 * backup.ts - Backup/restore (JSON) and Excel export controllers
 */
import { isPlainObject, isNonEmptyString, isFiniteNumber, validateRules } from "../utils/validation.ts";
import { logError, getLogHistory } from "../utils/logger.ts";
import { openVersionedDb } from "../state/db-utils.ts";
import {
  appState,
  setAppState,
  saveDatabase,
  saveAppStateToDb,
  saveSafetyBackupToDb,
  getSafetyBackupsFromDb,
  seedDatabase,
  migrateRoomsConfig,
  migrateSalariesConfig,
  migrateActivities,
  clearAllActivityVersionsFromDb,
  getFiscalYear,
  getQuarterNumber,
  getActivePricingGrid,
  getFlattenedRoomTarifs
} from "../state/state.ts";
import {
  showToast,
  showLoadingOverlay,
  hideLoadingOverlay,
  getRoomsTariffTotal,
  getActivityReferences,
  getReservationRoomLabel
} from "../utils/utils.ts";

// --- Automatic file backup (File System Access API) ---
// Keeps the localStorage database as the single source of truth; this only
// mirrors a JSON snapshot to a file the user picked, on every saveDatabase().
// The FileSystemFileHandle itself is persisted in a tiny IndexedDB store (not
// used for app data) so the connection survives page reloads.
const AUTO_BACKUP_DB_NAME = "outil_marie_autobackup";
const AUTO_BACKUP_STORE = "handles";
const AUTO_BACKUP_KEY = "backup_file";
const AUTO_BACKUP_DB_VERSION = 1;

let autoBackupHandle: any = null;
let autoBackupLastWrite: Date | null = null;
let autoBackupWriteTimer: any = null;

function upgradeAutoBackupDb(db: IDBDatabase, oldVersion: number) {
  if (oldVersion < 1 && !db.objectStoreNames.contains(AUTO_BACKUP_STORE)) {
    db.createObjectStore(AUTO_BACKUP_STORE);
  }
}

function openAutoBackupDb(): Promise<IDBDatabase> {
  return openVersionedDb(AUTO_BACKUP_DB_NAME, AUTO_BACKUP_DB_VERSION, upgradeAutoBackupDb);
}

async function idbGetAutoBackupHandle(): Promise<any> {
  const db = await openAutoBackupDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUTO_BACKUP_STORE, "readonly");
    const req = tx.objectStore(AUTO_BACKUP_STORE).get(AUTO_BACKUP_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSetAutoBackupHandle(handle: any): Promise<void> {
  const db = await openAutoBackupDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUTO_BACKUP_STORE, "readwrite");
    tx.objectStore(AUTO_BACKUP_STORE).put(handle, AUTO_BACKUP_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbClearAutoBackupHandle(): Promise<void> {
  const db = await openAutoBackupDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUTO_BACKUP_STORE, "readwrite");
    tx.objectStore(AUTO_BACKUP_STORE).delete(AUTO_BACKUP_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Builds the status widget with DOM APIs (not innerHTML) since the file name
// comes from the user's filesystem and shouldn't be interpolated as markup.
function renderAutoBackupStatus(status: string, filename?: string) {
  updateAutoBackupBanner(status, filename);

  const container = document.getElementById("auto-backup-status");
  if (!container) return;
  container.innerHTML = "";

  if (status === "unsupported") {
    const span = document.createElement("span");
    span.style.color = "var(--text-secondary)";
    span.textContent = "Non disponible sur ce navigateur (Chrome ou Edge requis).";
    container.appendChild(span);
    return;
  }

  if (status === "disconnected") {
    const btn = document.createElement("button");
    btn.id = "auto-backup-connect-btn";
    btn.className = "btn btn-primary btn-secondary";
    btn.textContent = "Choisir un fichier de sauvegarde automatique";
    container.appendChild(btn);
    return;
  }

  const badge = document.createElement("span");
  badge.className = status === "connected" ? "badge badge-success" : "badge badge-warning";
  badge.textContent = status === "connected" ? "Actif" : "Action requise";
  container.appendChild(badge);

  const info = document.createElement("span");
  let infoText = `Fichier : ${filename}`;
  if (status === "connected" && autoBackupLastWrite) {
    infoText += ` — dernière écriture : ${autoBackupLastWrite.toLocaleTimeString("fr-CA")}`;
  }
  info.textContent = infoText;
  container.appendChild(info);

  if (status === "needs-permission") {
    const reconnectBtn = document.createElement("button");
    reconnectBtn.id = "auto-backup-reconnect-btn";
    reconnectBtn.className = "btn btn-secondary";
    reconnectBtn.textContent = "Réactiver";
    container.appendChild(reconnectBtn);
  }

  const disconnectBtn = document.createElement("button");
  disconnectBtn.id = "auto-backup-disconnect-btn";
  disconnectBtn.className = "btn btn-secondary btn-danger";
  disconnectBtn.textContent = "Désactiver";
  container.appendChild(disconnectBtn);
}

// Shows/hides the app-wide banner (visible on every view, not just the
// Sauvegarde & Export screen) so a lapsed permission doesn't go unnoticed.
function updateAutoBackupBanner(status: string, filename?: string) {
  const banner = document.getElementById("auto-backup-reminder-banner");
  if (!banner) return;

  if (status === "needs-permission") {
    const fnEl = document.getElementById("auto-backup-reminder-filename");
    if (fnEl) fnEl.textContent = filename || "";
    banner.style.display = "flex";
  } else {
    banner.style.display = "none";
  }
}

async function initAutoBackup() {
  if (!window.showSaveFilePicker) {
    renderAutoBackupStatus("unsupported");
    return;
  }
  try {
    const stored = await idbGetAutoBackupHandle();
    if (!stored) {
      renderAutoBackupStatus("disconnected");
      return;
    }
    autoBackupHandle = stored;
    const perm = await stored.queryPermission({ mode: "readwrite" });
    renderAutoBackupStatus(perm === "granted" ? "connected" : "needs-permission", stored.name);
  } catch (e) {
    logError("backup", "initialisation de la sauvegarde automatique", e);
    renderAutoBackupStatus("disconnected");
  }
}

async function connectAutoBackupFile() {
  if (!window.showSaveFilePicker) return;
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: "compta_marie_autosave.json",
      types: [{ description: "Sauvegarde JSON", accept: { "application/json": [".json"] } }]
    });
    const perm = await handle.requestPermission({ mode: "readwrite" });
    if (perm !== "granted") {
      showToast("Permission refusée : impossible d'activer la sauvegarde automatique.", "error");
      return;
    }
    await idbSetAutoBackupHandle(handle);
    autoBackupHandle = handle;
    renderAutoBackupStatus("connected", handle.name);
    await writeAutoBackupNow();
  } catch (e: any) {
    if (e.name !== "AbortError") {
      logError("backup", "sélection du fichier de sauvegarde automatique", e);
      showToast("Erreur lors de la sélection du fichier : " + e.message, "error");
    }
  }
}

async function reconnectAutoBackupPermission() {
  if (!autoBackupHandle) return;
  try {
    const perm = await autoBackupHandle.requestPermission({ mode: "readwrite" });
    if (perm === "granted") {
      renderAutoBackupStatus("connected", autoBackupHandle.name);
      await writeAutoBackupNow();
    } else {
      showToast("Permission refusée.", "error");
    }
  } catch (e: any) {
    logError("backup", "reconnexion de la permission de sauvegarde automatique", e);
    showToast("Erreur lors de la reconnexion : " + e.message, "error");
  }
}

async function disconnectAutoBackup() {
  if (!confirm("Désactiver la sauvegarde automatique vers ce fichier ?")) return;
  await idbClearAutoBackupHandle();
  autoBackupHandle = null;
  autoBackupLastWrite = null;
  renderAutoBackupStatus("disconnected");
}

// Debounced so a burst of saveDatabase() calls (e.g. migrations) only
// triggers a single disk write.
function scheduleAutoBackupWrite() {
  if (!autoBackupHandle) return;
  clearTimeout(autoBackupWriteTimer);
  autoBackupWriteTimer = setTimeout(writeAutoBackupNow, 1500);
}

async function writeAutoBackupNow() {
  if (!autoBackupHandle) return;
  try {
    const perm = await autoBackupHandle.queryPermission({ mode: "readwrite" });
    if (perm !== "granted") {
      renderAutoBackupStatus("needs-permission", autoBackupHandle.name);
      return;
    }
    const writable = await autoBackupHandle.createWritable();
    await writable.write(JSON.stringify(appState, null, 2));
    await writable.close();
    autoBackupLastWrite = new Date();
    renderAutoBackupStatus("connected", autoBackupHandle.name);

    // A successful auto backup counts as a real backup for reminder purposes.
    // Saved directly (not via saveDatabase()) to avoid re-triggering this
    // same debounced write in a loop.
    const today = autoBackupLastWrite.toISOString().split("T")[0];
    if (appState.settings.last_backup_date !== today) {
      appState.settings.last_backup_date = today;
      await saveAppStateToDb(appState);
      checkBackupReminder();
      renderBackupView();
    }
  } catch (e) {
    logError("backup", "écriture de la sauvegarde automatique", e);
  }
}

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
      const { applyTheme, renderAll } = await import("../navigation.ts");
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
      import("../navigation.ts").then(m => m.switchToView("backup"));
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

// True if `arr` isn't an array (an earlier rule already flags that) or every item satisfies
// `predicate` — lets the item-shape rules below stay no-ops instead of throwing when the
// collection itself is the wrong type (e.g. a string where an array was expected).
function arrayItemsMatch(arr: any, predicate: (item: any) => boolean): boolean {
  return !Array.isArray(arr) || arr.every(predicate);
}

// Deep-shape checks for a single reservation record within an activity. Catches the case of a
// hand-edited or corrupted backup where a reservation's slots/fees/tariff hold the wrong type
// (e.g. a string instead of a number) that would otherwise only surface as a silent NaN/crash
// later, in rendering or billing calculations.
function validateReservationShape(r: any): boolean {
  if (!isPlainObject(r)) return false;
  if (r.room_name !== undefined && typeof r.room_name !== "string") return false;
  if (r.tariff_amount !== undefined && !isFiniteNumber(r.tariff_amount)) return false;
  if (r.slots !== undefined && !Array.isArray(r.slots)) return false;
  if (
    !arrayItemsMatch(
      r.slots,
      (s: any) => isPlainObject(s) && typeof s.date === "string" && typeof s.start_time === "string" && typeof s.end_time === "string"
    )
  ) {
    return false;
  }
  if (r.fees !== undefined && !Array.isArray(r.fees)) return false;
  if (!arrayItemsMatch(r.fees, (f: any) => isPlainObject(f) && typeof f.description === "string" && isFiniteNumber(f.amount))) {
    return false;
  }
  if (r.staff !== undefined && !Array.isArray(r.staff)) return false;
  if (!arrayItemsMatch(r.staff, (s: any) => isPlainObject(s))) return false;
  if (r.services !== undefined && !Array.isArray(r.services)) return false;
  if (!arrayItemsMatch(r.services, (s: any) => isPlainObject(s))) return false;
  return true;
}

// A distribution ties a billed amount to a GL account code; both must have the right type or
// the reconciliation/export math (which sums `amount`) silently produces NaN/garbage totals.
function validateDistributionShape(d: any): boolean {
  return isPlainObject(d) && isNonEmptyString(d.account_code) && isFiniteNumber(d.amount);
}

// Inspects one activity's internal fields beyond just its `id`, so a corrupted or hand-edited
// backup can't slip malformed reservations/distributions/dates past validation and only fail
// later as a silent rendering or billing crash.
function validateActivityDeepShape(a: any): boolean {
  if (!isPlainObject(a)) return false;
  if (a.name !== undefined && typeof a.name !== "string") return false;
  if (a.date_start !== undefined && typeof a.date_start !== "string") return false;
  if (a.date_end !== undefined && typeof a.date_end !== "string") return false;
  if (a.attendees_count !== undefined && !isFiniteNumber(a.attendees_count)) return false;
  if (a.reservations !== undefined && !Array.isArray(a.reservations)) return false;
  if (!arrayItemsMatch(a.reservations, validateReservationShape)) return false;
  if (a.distributions !== undefined && !Array.isArray(a.distributions)) return false;
  if (!arrayItemsMatch(a.distributions, validateDistributionShape)) return false;
  return true;
}

function validateBackupSchema(parsed: any): { valid: boolean; error?: string } {
  const settings = isPlainObject(parsed) ? parsed.settings : undefined;
  const activities = isPlainObject(parsed) ? parsed.activities : undefined;
  const activityIds = Array.isArray(activities)
    ? activities.filter((a: any) => isPlainObject(a) && isNonEmptyString(a.id)).map((a: any) => a.id)
    : [];

  return validateRules([
    [isPlainObject(parsed), "Le contenu du fichier n'est pas un objet JSON valide."],
    [isPlainObject(parsed) && Array.isArray(activities), "Le fichier de sauvegarde doit contenir une liste d'activités ('activities')."],
    [
      arrayItemsMatch(activities, (a: any) => isPlainObject(a) && isNonEmptyString(a.id)),
      "Chaque activité de la liste ('activities') doit être un objet avec un identifiant ('id') non vide."
    ],
    [
      new Set(activityIds).size === activityIds.length,
      "Le fichier contient des activités avec des identifiants ('id') en double."
    ],
    [
      arrayItemsMatch(activities, validateActivityDeepShape),
      "Une ou plusieurs activités contiennent des données invalides (réservations, distributions ou dates dont le type est incorrect)."
    ],
    [!settings || isPlainObject(settings), "La section de configuration ('settings') est invalide."],
    [!settings?.rooms || Array.isArray(settings.rooms), "La configuration des salles ('settings.rooms') doit être une liste."],
    [
      arrayItemsMatch(settings?.rooms, (r: any) => isPlainObject(r) && isNonEmptyString(r.name)),
      "Chaque salle ('settings.rooms') doit être un objet avec un nom ('name') non vide."
    ],
    [!settings?.salaries || Array.isArray(settings.salaries), "La configuration des salaires ('settings.salaries') doit être une liste."],
    [
      arrayItemsMatch(settings?.salaries, (s: any) => isPlainObject(s) && isNonEmptyString(s.id)),
      "Chaque emploi ('settings.salaries') doit être un objet avec un identifiant ('id') non vide."
    ],
    [!settings?.services || Array.isArray(settings.services), "La configuration des services ('settings.services') doit être une liste."],
    [
      arrayItemsMatch(settings?.services, (s: any) => isPlainObject(s) && isNonEmptyString(s.id)),
      "Chaque équipement ('settings.services') doit être un objet avec un identifiant ('id') non vide."
    ],
    [!settings?.accounts || Array.isArray(settings.accounts), "La configuration des comptes ('settings.accounts') doit être une liste."],
    [
      arrayItemsMatch(settings?.accounts, (a: any) => isPlainObject(a) && isNonEmptyString(a.code)),
      "Chaque compte ('settings.accounts') doit être un objet avec un code ('code') non vide."
    ],
    [
      !settings?.departments || Array.isArray(settings.departments),
      "La configuration des départements ('settings.departments') doit être une liste."
    ],
    [
      arrayItemsMatch(settings?.departments, (d: any) => isNonEmptyString(d)),
      "Chaque département ('settings.departments') doit être une chaîne de caractères non vide."
    ],
    [
      !settings?.global_tasks || Array.isArray(settings.global_tasks),
      "La configuration des tâches globales ('settings.global_tasks') doit être une liste."
    ],
    [
      arrayItemsMatch(settings?.global_tasks, (t: any) => isPlainObject(t) && isNonEmptyString(t.id)),
      "Chaque tâche globale ('settings.global_tasks') doit être un objet avec un identifiant ('id') non vide."
    ],
    [
      !settings?.schedulable_tasks || Array.isArray(settings.schedulable_tasks),
      "La configuration des tâches programmables ('settings.schedulable_tasks') doit être une liste."
    ],
    [
      arrayItemsMatch(settings?.schedulable_tasks, (t: any) => isPlainObject(t) && isNonEmptyString(t.id)),
      "Chaque tâche programmable ('settings.schedulable_tasks') doit être un objet avec un identifiant ('id') non vide."
    ],
    [!parsed?.favorites || Array.isArray(parsed.favorites), "La section des favoris ('favorites') doit être une liste."],
    [
      !parsed?.selected_quarters || Array.isArray(parsed.selected_quarters),
      "La section des trimestres sélectionnés ('selected_quarters') doit être une liste."
    ]
  ]);
}

function handleJsonBackupFile(file: File) {
  const reader = new FileReader();

  reader.onload = async function (e) {
    try {
      const result = e.target?.result;
      if (typeof result !== "string") return;
      const parsed = JSON.parse(result);
      const validation = validateBackupSchema(parsed);
      if (!validation.valid) {
        showToast("Échec de la validation : " + validation.error, "error", 6000);
        return;
      }

      if (confirm("La restauration va écraser la base de données actuelle. Continuer ?")) {
        const preRestoreSnapshot = JSON.parse(JSON.stringify(appState));
        try {
          await saveSafetyBackupToDb("avant_restauration", preRestoreSnapshot);
        } catch (err) {
          logError("backup", "sauvegarde de sécurité avant restauration", err);
        }
        renderSafetyBackupsList();

        setAppState(parsed);

        // Sanitize settings on restoration
        if (!appState.favorites) appState.favorites = [];
        if (!appState.settings) {
          appState.settings = {
            theme: "dark",
            rooms: [],
            departments: [],
            accounts: [],
            last_backup_date: "",
            backup_reminder_days: 7,
            salaries: [],
            services: [],
            global_tasks: [],
            schedulable_tasks: []
          };
        }
        if (!appState.settings.rooms) appState.settings.rooms = [];
        if (!appState.settings.salaries) appState.settings.salaries = [];
        if (!appState.settings.services) appState.settings.services = [];
        if (!appState.settings.schedulable_tasks) appState.settings.schedulable_tasks = [];
        if (appState.settings.last_backup_date === undefined) appState.settings.last_backup_date = "";
        appState.settings.backup_reminder_days = parseInt(appState.settings.backup_reminder_days as any, 10);
        if (isNaN(appState.settings.backup_reminder_days)) {
          appState.settings.backup_reminder_days = 7;
        }

        // Sort accounts on restoration
        if (appState.settings && appState.settings.accounts) {
          appState.settings.accounts.sort((a, b) => a.code.localeCompare(b.code));
        }

        // Restored files may predate the pricing-grid/rate-versioning/activity migrations —
        // run the same migrations loadDatabase() applies on normal startup. Guarded separately:
        // a migration bug here must not leave the running app on a half-migrated appState that
        // an unrelated later save() would then persist over the still-intact on-disk data.
        try {
          migrateRoomsConfig(appState.settings.rooms);
          migrateSalariesConfig(appState.settings.salaries);
          migrateActivities(appState.activities, appState.settings);
        } catch (err) {
          logError("backup", "migration des données lors de la restauration", err);
          setAppState(preRestoreSnapshot);
          showToast(
            "La restauration a échoué pendant la mise à jour du format des données. Vos données précédentes ont été conservées (rien n'a été écrasé sur le disque). Veuillez recharger la page.",
            "error",
            12000
          );
          return;
        }

        try {
          await clearAllActivityVersionsFromDb();
        } catch (err) {
          logError("backup", "suppression des versions lors de la restauration", err);
        }
        await saveDatabase();
        const { applyTheme, renderAll } = await import("../navigation.ts");
        applyTheme(appState.settings.theme || "dark");
        renderAll();
        checkBackupReminder();
        showToast("Base de données restaurée avec succès !", "success");
      }
    } catch (err: any) {
      showToast("Erreur lors de la lecture du fichier JSON : " + err.message, "error");
    }
  };

  reader.readAsText(file);
}

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

// Generate structured excel matching the original template
function exportToExcel() {
  // Helper to convert column index to letter
  function getExcelColName(colIdx: number) {
    let temp,
      letter = "";
    while (colIdx > 0) {
      temp = (colIdx - 1) % 26;
      letter = String.fromCharCode(65 + temp) + letter;
      colIdx = (colIdx - temp - 1) / 26;
    }
    return letter;
  }

  showLoadingOverlay("Génération de l'export Excel...");
  // Deferred so the overlay actually paints before this synchronous, potentially long-running
  // workbook generation blocks the main thread.
  setTimeout(() => runExportToExcel(getExcelColName), 20);
}

function runExportToExcel(getExcelColName: (colIdx: number) => string) {
  try {
    const wb = XLSX.utils.book_new();

    // Sheet 1: ACTIVITÉS
    // Define Headers
    const headers = [
      "NUMERO ACTIVITE",
      "RESPONSABLE FACTURATION",
      "NOM DE L'ACTIVITÉ",
      "DATE DÉBUT",
      "DATE FIN",
      "Nbre jour occupation (formule)",
      "Client interne ou externe",
      "CATÉGORIE (Rébecca)",
      "SALLE (menu déroulant)",
      "TEMPS RÉMI (en heure)",
      "DÉPARTEMENT (menu déroulant À VENIR)",
      "PRIX SALLE SANS FRAIS (formule) interne seulement",
      "NUMÉRO DE FACTURE, RÉQUISITION INTERNE OU ENCAISSEMENT"
    ];

    // Add all configured account codes as columns
    const accountsOrder = appState.settings.accounts.map(a => a.code);
    accountsOrder.forEach(code => {
      const label = appState.settings.accounts.find(a => a.code === code)?.description || "";
      headers.push(`${code}\n${label}`);
    });

    headers.push("REVENUS TOTAL RÉÈL");

    const sheetData = [headers];

    // Filter activities for active period
    const activeActivities = appState.activities.filter(act => {
      if (act.deleted) return false;
      if (act.name.trim() === "") return false;
      const actYear = getFiscalYear(act.date_start);
      const actQuarter = getQuarterNumber(act.date_start);
      return actYear === appState.selected_year && actQuarter !== null && appState.selected_quarters.includes(actQuarter);
    });

    // Add activities rows
    activeActivities.forEach((act, rIdx) => {
      const isFilled = act.name.trim() !== "";
      const row: any[] = [];

      row.push(act.id); // NUMERO ACTIVITE
      row.push(isFilled ? act.responsable : ""); // RESPONSABLE FACTURATION
      row.push(isFilled ? act.name : ""); // NOM DE L'ACTIVITÉ
      row.push(isFilled ? act.date_start : ""); // DATE DÉBUT
      row.push(isFilled ? act.date_end : ""); // DATE FIN

      // Nbre jour occupation (written as formula in row index rIdx + 2 since index 1 is headers)
      const excelRow = rIdx + 2;
      row.push({ t: "n", f: `E${excelRow}-D${excelRow}+1` });

      row.push(isFilled ? act.client_type : ""); // Client interne ou externe
      row.push(isFilled ? act.category || "" : ""); // CATÉGORIE
      row.push(isFilled ? (act.reservations || []).map(getReservationRoomLabel).join(", ") : ""); // SALLE
      row.push(0); // TEMPS RÉMI
      row.push(isFilled ? act.department : ""); // DÉPARTEMENT

      // PRIX SALLE SANS FRAIS
      row.push(isFilled && act.client_type === "interne" ? getRoomsTariffTotal(act) : 0);

      row.push(isFilled ? getActivityReferences(act) : ""); // NUMÉRO DE FACTURE...

      // Distribute amounts to matching account columns
      accountsOrder.forEach(code => {
        const dist = act.distributions.find((d: any) => d.account_code === code);
        row.push(dist ? dist.amount : 0);
      });

      // REVENUS TOTAL RÉÈL (written as formula summing distributions)
      const firstDistCol = getExcelColName(13 + 1); // 1-based index (N)
      const lastDistCol = getExcelColName(13 + accountsOrder.length); // End of accounts

      row.push({ t: "n", f: `SUM(${firstDistCol}${excelRow}:${lastDistCol}${excelRow})` });

      sheetData.push(row);
    });

    // Add Total sum row at the bottom
    const totalRowIdx = sheetData.length + 1;
    const totalRow = new Array(13).fill("");
    totalRow[0] = "TOTAUX COMPLETS";

    // Sum formula for each accounts column and total column
    const startRow = 2;
    const endRow = totalRowIdx - 1;

    accountsOrder.forEach((code, aIdx) => {
      const colLetter = getExcelColName(13 + aIdx + 1);
      totalRow.push({ t: "n", f: `SUM(${colLetter}${startRow}:${colLetter}${endRow})` });
    });

    const totalColLetter = getExcelColName(13 + accountsOrder.length + 1);
    totalRow.push({ t: "n", f: `SUM(${totalColLetter}${startRow}:${totalColLetter}${endRow})` });

    sheetData.push(totalRow);

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // Adjust columns widths
    ws["!cols"] = [
      { wch: 15 }, // ID
      { wch: 20 }, // Responsable
      { wch: 25 }, // Nom
      { wch: 12 }, // Date D
      { wch: 12 }, // Date F
      { wch: 10 }, // Jours
      { wch: 12 }, // Client type
      { wch: 10 }, // Catégorie
      { wch: 15 }, // Salle
      { wch: 10 }, // Rémi
      { wch: 22 }, // Département
      { wch: 15 }, // Sans frais
      { wch: 20 } // Facture/RI
    ];

    // Push account columns sizes
    accountsOrder.forEach(() => ws["!cols"].push({ wch: 18 }));
    ws["!cols"].push({ wch: 20 }); // Total revenue

    XLSX.utils.book_append_sheet(wb, ws, "ACTIVITÉS");

    // Sheet 2: Configuration Salles (une ligne par cellule de la grille tarifaire active)
    const roomsData = [["SALLE", "GRILLE (ENTRÉE EN VIGUEUR)", "TARIF", "MONTANT ($/JOUR)"]];
    appState.settings.rooms.forEach(r => {
      const grid = getActivePricingGrid(r, "");
      const tarifs = grid ? getFlattenedRoomTarifs(r, "") : [];
      (tarifs.length ? tarifs : [{ description: "", amount: "" }]).forEach(t => {
        roomsData.push([r.name, grid ? grid.effective_date || "Depuis toujours" : "", t.description, t.amount]);
      });
    });
    const wsRooms = XLSX.utils.aoa_to_sheet(roomsData);
    XLSX.utils.book_append_sheet(wb, wsRooms, "SALLES");

    // Trigger download: includes selected period in filename
    const qStr = appState.selected_quarters
      .sort()
      .map(q => `T${q}`)
      .join("-");
    const filename = `compta_marie_rapport_${appState.selected_year}_${qStr || "aucun"}_${new Date().toISOString().split("T")[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
    showToast("Export Excel terminé.", "success");
  } catch (err: any) {
    logError("backup", "export Excel", err);
    showToast("Erreur lors de l'export Excel : " + err.message, "error");
  } finally {
    hideLoadingOverlay();
  }
}

export {
  validateBackupSchema,
  exportToExcel,
  exportDiagnosticLogs,
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
  writeAutoBackupNow,
  initBackupHandlers,
  handleJsonBackupFile,
  getDaysSinceLastBackup,
  formatLocalDateToFrench,
  checkBackupReminder,
  renderBackupView,
  renderSafetyBackupsList
};
