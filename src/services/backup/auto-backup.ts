/**
 * auto-backup.ts - Automatic directory backup (File System Access API). Keeps the localStorage
 * database as the single source of truth; this only mirrors JSON snapshots to a directory the user
 * picked. The FileSystemDirectoryHandle itself is persisted in a tiny IndexedDB store
 * so the connection survives page reloads. Inside the directory, we maintain:
 * - backup_regulier.json (on every database save, 1 minute or less)
 * - backup_15min.json (every 15 minutes)
 * - backup_heure.json (every hour)
 * - backup_jour.json (every day)
 * - backup_semaine.json (every week)
 */
import { logError } from "../../utils/logger.ts";
import { openVersionedDb } from "../../state/db-utils.ts";
import { appState, saveAppStateToDb } from "../../state/state.ts";
import { showToast } from "../../utils/utils.ts";
import { checkBackupReminder, renderBackupView } from "./reminder.ts";

const AUTO_BACKUP_DB_NAME = "outil_marie_autobackup";
const AUTO_BACKUP_STORE = "handles";
const AUTO_BACKUP_KEY = "backup_directory";
const AUTO_BACKUP_DB_VERSION = 1;

let autoBackupHandle: any = null; // Stores the FileSystemDirectoryHandle
let autoBackupWriteTimer: any = null;

let lastWriteRegulier: Date | null = null;
let lastWrite15Min: Date | null = null;
let lastWriteHeure: Date | null = null;
let lastWriteJour: Date | null = null;
let lastWriteSemaine: Date | null = null;

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

async function idbGetLastWrites(): Promise<{
  regulier: Date | null;
  min15: Date | null;
  heure: Date | null;
  jour: Date | null;
  semaine: Date | null;
}> {
  const db = await openAutoBackupDb();
  return new Promise((resolve) => {
    const tx = db.transaction(AUTO_BACKUP_STORE, "readonly");
    const store = tx.objectStore(AUTO_BACKUP_STORE);
    const reqReg = store.get("last_write_regulier");
    const req15 = store.get("last_write_15min");
    const reqH = store.get("last_write_heure");
    const reqJ = store.get("last_write_jour");
    const reqS = store.get("last_write_semaine");

    let doneCount = 0;
    const res = {
      regulier: null as Date | null,
      min15: null as Date | null,
      heure: null as Date | null,
      jour: null as Date | null,
      semaine: null as Date | null,
    };

    const checkDone = () => {
      doneCount++;
      if (doneCount === 5) resolve(res);
    };

    reqReg.onsuccess = () => { if (reqReg.result) res.regulier = new Date(reqReg.result); checkDone(); };
    reqReg.onerror = checkDone;
    req15.onsuccess = () => { if (req15.result) res.min15 = new Date(req15.result); checkDone(); };
    req15.onerror = checkDone;
    reqH.onsuccess = () => { if (reqH.result) res.heure = new Date(reqH.result); checkDone(); };
    reqH.onerror = checkDone;
    reqJ.onsuccess = () => { if (reqJ.result) res.jour = new Date(reqJ.result); checkDone(); };
    reqJ.onerror = checkDone;
    reqS.onsuccess = () => { if (reqS.result) res.semaine = new Date(reqS.result); checkDone(); };
    reqS.onerror = checkDone;
  });
}

async function idbSetLastWrite(key: string, date: Date): Promise<void> {
  const db = await openAutoBackupDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUTO_BACKUP_STORE, "readwrite");
    tx.objectStore(AUTO_BACKUP_STORE).put(date.getTime(), key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbClearAllLastWrites(): Promise<void> {
  const db = await openAutoBackupDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUTO_BACKUP_STORE, "readwrite");
    const store = tx.objectStore(AUTO_BACKUP_STORE);
    store.delete("last_write_regulier");
    store.delete("last_write_15min");
    store.delete("last_write_heure");
    store.delete("last_write_jour");
    store.delete("last_write_semaine");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function formatLastWrite(date: Date | null, showDate = false): string {
  if (!date) return "En attente";
  if (showDate) {
    return date.toLocaleString("fr-CA", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleTimeString("fr-CA");
}

// Builds the status widget with DOM APIs (not innerHTML) since the directory name
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
    btn.textContent = "Choisir un dossier de sauvegarde automatique";
    container.appendChild(btn);
    return;
  }

  // Row for status badge, folder info, and action buttons
  const statusRow = document.createElement("div");
  statusRow.style.display = "flex";
  statusRow.style.alignItems = "center";
  statusRow.style.gap = "12px";
  statusRow.style.flexWrap = "wrap";
  statusRow.style.width = "100%";
  statusRow.style.marginBottom = "8px";

  const badge = document.createElement("span");
  badge.className = status === "connected" ? "badge badge-success" : status === "write-error" ? "badge badge-danger" : "badge badge-warning";
  badge.textContent = status === "connected" ? "Actif" : status === "write-error" ? "Échec d'écriture" : "Action requise";
  statusRow.appendChild(badge);

  const info = document.createElement("span");
  let infoText = `Dossier : ${filename}`;
  if (status === "write-error") {
    infoText += " — Échec de l'écriture de la sauvegarde automatique.";
  }
  info.textContent = infoText;
  statusRow.appendChild(info);

  if (status === "needs-permission") {
    const reconnectBtn = document.createElement("button");
    reconnectBtn.id = "auto-backup-reconnect-btn";
    reconnectBtn.className = "btn btn-secondary";
    reconnectBtn.textContent = "Réactiver";
    statusRow.appendChild(reconnectBtn);
  }

  const disconnectBtn = document.createElement("button");
  disconnectBtn.id = "auto-backup-disconnect-btn";
  disconnectBtn.className = "btn btn-secondary btn-danger";
  disconnectBtn.textContent = "Désactiver";
  statusRow.appendChild(disconnectBtn);

  container.appendChild(statusRow);

  // Files grid showing detailed status of the 5 backups
  const filesGrid = document.createElement("div");
  filesGrid.style.display = "grid";
  filesGrid.style.gridTemplateColumns = "repeat(auto-fill, minmax(200px, 1fr))";
  filesGrid.style.gap = "12px";
  filesGrid.style.width = "100%";
  filesGrid.style.marginTop = "12px";

  const backupsInfo = [
    { label: "Régulier (1 min ou moins)", file: "backup_regulier.json", date: lastWriteRegulier, showDate: false },
    { label: "Aux 15 minutes", file: "backup_15min.json", date: lastWrite15Min, showDate: false },
    { label: "À l'heure", file: "backup_heure.json", date: lastWriteHeure, showDate: false },
    { label: "À la journée", file: "backup_jour.json", date: lastWriteJour, showDate: true },
    { label: "À la semaine", file: "backup_semaine.json", date: lastWriteSemaine, showDate: true }
  ];

  backupsInfo.forEach(item => {
    const card = document.createElement("div");
    card.style.padding = "10px 14px";
    card.style.borderRadius = "var(--radius-md)";
    card.style.backgroundColor = "var(--bg-main)";
    card.style.border = "1px solid var(--border-color)";
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.gap = "4px";

    const labelEl = document.createElement("span");
    labelEl.style.fontWeight = "600";
    labelEl.style.fontSize = "0.85rem";
    labelEl.textContent = item.label;
    card.appendChild(labelEl);

    const fileEl = document.createElement("span");
    fileEl.style.fontSize = "0.75rem";
    fileEl.style.color = "var(--text-secondary)";
    fileEl.textContent = item.file;
    card.appendChild(fileEl);

    const dateEl = document.createElement("span");
    dateEl.style.fontSize = "0.8rem";
    dateEl.style.color = item.date ? "var(--success)" : "var(--text-secondary)";
    dateEl.textContent = item.date ? `Écrit : ${formatLastWrite(item.date, item.showDate)}` : "En attente";
    card.appendChild(dateEl);

    filesGrid.appendChild(card);
  });

  container.appendChild(filesGrid);
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
  if (!window.showDirectoryPicker) {
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

    const writes = await idbGetLastWrites();
    lastWriteRegulier = writes.regulier;
    lastWrite15Min = writes.min15;
    lastWriteHeure = writes.heure;
    lastWriteJour = writes.jour;
    lastWriteSemaine = writes.semaine;

    const perm = await stored.queryPermission({ mode: "readwrite" });
    renderAutoBackupStatus(perm === "granted" ? "connected" : "needs-permission", stored.name);
  } catch (e) {
    logError("backup", "initialisation de la sauvegarde automatique", e);
    renderAutoBackupStatus("disconnected");
  }
}

async function connectAutoBackupFile() {
  if (!window.showDirectoryPicker) return;
  try {
    const handle = await window.showDirectoryPicker({
      mode: "readwrite"
    });
    const perm = await handle.requestPermission({ mode: "readwrite" });
    if (perm !== "granted") {
      showToast("Permission refusée : impossible d'activer la sauvegarde automatique.", "error");
      return;
    }
    await idbSetAutoBackupHandle(handle);
    autoBackupHandle = handle;

    lastWriteRegulier = null;
    lastWrite15Min = null;
    lastWriteHeure = null;
    lastWriteJour = null;
    lastWriteSemaine = null;
    await idbClearAllLastWrites();

    renderAutoBackupStatus("connected", handle.name);
    await writeAutoBackupNow();
  } catch (e: any) {
    if (e.name !== "AbortError") {
      logError("backup", "sélection du dossier de sauvegarde automatique", e);
      showToast("Erreur lors de la sélection du dossier : " + e.message, "error");
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
  if (!confirm("Désactiver la sauvegarde automatique vers ce dossier ?")) return;
  await idbClearAutoBackupHandle();
  await idbClearAllLastWrites();
  autoBackupHandle = null;
  lastWriteRegulier = null;
  lastWrite15Min = null;
  lastWriteHeure = null;
  lastWriteJour = null;
  lastWriteSemaine = null;
  renderAutoBackupStatus("disconnected");
}

// Debounced so a burst of saveDatabase() calls (e.g. migrations) only
// triggers a single disk write.
function scheduleAutoBackupWrite() {
  if (!autoBackupHandle) return;
  clearTimeout(autoBackupWriteTimer);
  autoBackupWriteTimer = setTimeout(writeAutoBackupNow, 1500);
}

// If the app is closed/reloaded while a debounced write is still pending, that write would
// otherwise never happen and the auto-backup file would silently fall behind the real
// (IndexedDB) state. Fire the write immediately instead of waiting out the debounce.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (autoBackupWriteTimer) {
      clearTimeout(autoBackupWriteTimer);
      autoBackupWriteTimer = null;
      void writeAutoBackupNow();
    }
  });
}

async function writeAutoBackupNow() {
  if (!autoBackupHandle) return;
  try {
    const perm = await autoBackupHandle.queryPermission({ mode: "readwrite" });
    if (perm !== "granted") {
      renderAutoBackupStatus("needs-permission", autoBackupHandle.name);
      return;
    }

    const now = new Date();

    // 1. Regular backup: always written
    const fileReg = await autoBackupHandle.getFileHandle("backup_regulier.json", { create: true });
    const writableReg = await fileReg.createWritable();
    await writableReg.write(JSON.stringify(appState, null, 2));
    await writableReg.close();

    lastWriteRegulier = now;
    await idbSetLastWrite("last_write_regulier", now);

    // 2. 15 minutes backup
    if (!lastWrite15Min || (now.getTime() - lastWrite15Min.getTime() >= 15 * 60 * 1000)) {
      const file15 = await autoBackupHandle.getFileHandle("backup_15min.json", { create: true });
      const writable15 = await file15.createWritable();
      await writable15.write(JSON.stringify(appState, null, 2));
      await writable15.close();

      lastWrite15Min = now;
      await idbSetLastWrite("last_write_15min", now);
    }

    // 3. Hourly backup
    if (!lastWriteHeure || (now.getTime() - lastWriteHeure.getTime() >= 60 * 60 * 1000)) {
      const fileH = await autoBackupHandle.getFileHandle("backup_heure.json", { create: true });
      const writableH = await fileH.createWritable();
      await writableH.write(JSON.stringify(appState, null, 2));
      await writableH.close();

      lastWriteHeure = now;
      await idbSetLastWrite("last_write_heure", now);
    }

    // 4. Daily backup
    const isDifferentDay = !lastWriteJour || (
      now.getFullYear() !== lastWriteJour.getFullYear() ||
      now.getMonth() !== lastWriteJour.getMonth() ||
      now.getDate() !== lastWriteJour.getDate()
    );
    if (isDifferentDay) {
      const fileJ = await autoBackupHandle.getFileHandle("backup_jour.json", { create: true });
      const writableJ = await fileJ.createWritable();
      await writableJ.write(JSON.stringify(appState, null, 2));
      await writableJ.close();

      lastWriteJour = now;
      await idbSetLastWrite("last_write_jour", now);
    }

    // 5. Weekly backup
    if (!lastWriteSemaine || (now.getTime() - lastWriteSemaine.getTime() >= 7 * 24 * 60 * 60 * 1000)) {
      const fileS = await autoBackupHandle.getFileHandle("backup_semaine.json", { create: true });
      const writableS = await fileS.createWritable();
      await writableS.write(JSON.stringify(appState, null, 2));
      await writableS.close();

      lastWriteSemaine = now;
      await idbSetLastWrite("last_write_semaine", now);
    }

    renderAutoBackupStatus("connected", autoBackupHandle.name);

    // A successful auto backup counts as a real backup for reminder purposes.
    // Saved directly (not via saveDatabase()) to avoid re-triggering this
    // same debounced write in a loop.
    const today = now.toISOString().split("T")[0];
    if (appState.settings.last_backup_date !== today) {
      appState.settings.last_backup_date = today;
      await saveAppStateToDb(appState);
      checkBackupReminder();
      renderBackupView();
    }
  } catch (e: any) {
    logError("backup", "écriture de la sauvegarde automatique", e);
    renderAutoBackupStatus("write-error", autoBackupHandle.name);
    showToast("Échec de l'écriture de la sauvegarde automatique : " + (e?.message || e), "error", 8000);
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
