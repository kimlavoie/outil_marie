/**
 * auto-backup.ts - Automatic file backup (File System Access API). Keeps the localStorage
 * database as the single source of truth; this only mirrors a JSON snapshot to a file the user
 * picked, on every saveDatabase(). The FileSystemFileHandle itself is persisted in a tiny
 * IndexedDB store (not used for app data) so the connection survives page reloads.
 */
import { logError } from "../utils/logger.ts";
import { openVersionedDb } from "../state/db-utils.ts";
import { appState, saveAppStateToDb } from "../state/state.ts";
import { showToast } from "../utils/utils.ts";
import { checkBackupReminder, renderBackupView } from "./backup-reminder.ts";

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
};
