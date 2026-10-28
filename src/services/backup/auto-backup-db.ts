/**
 * backup/auto-backup-db.ts - IndexedDB persistence for the auto-backup directory connection: the
 * FileSystemDirectoryHandle itself (so the connection survives page reloads) and the last-write
 * timestamp for each of the 6 files auto-backup.ts maintains. Split out of auto-backup.ts, which
 * owns the actual File System Access API orchestration (connect/write/render) on top of this.
 */
import { openVersionedDb } from "../../state/db-utils.ts";

const AUTO_BACKUP_DB_NAME = "outil_marie_autobackup";
const AUTO_BACKUP_STORE = "handles";
const AUTO_BACKUP_KEY = "backup_directory";
const AUTO_BACKUP_DB_VERSION = 1;

function upgradeAutoBackupDb(db: IDBDatabase, oldVersion: number) {
  if (oldVersion < 1 && !db.objectStoreNames.contains(AUTO_BACKUP_STORE)) {
    db.createObjectStore(AUTO_BACKUP_STORE);
  }
}

export function openAutoBackupDb(): Promise<IDBDatabase> {
  return openVersionedDb(AUTO_BACKUP_DB_NAME, AUTO_BACKUP_DB_VERSION, upgradeAutoBackupDb);
}

export async function idbGetAutoBackupHandle(): Promise<any> {
  const db = await openAutoBackupDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUTO_BACKUP_STORE, "readonly");
    const req = tx.objectStore(AUTO_BACKUP_STORE).get(AUTO_BACKUP_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function idbSetAutoBackupHandle(handle: any): Promise<void> {
  const db = await openAutoBackupDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUTO_BACKUP_STORE, "readwrite");
    tx.objectStore(AUTO_BACKUP_STORE).put(handle, AUTO_BACKUP_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbClearAutoBackupHandle(): Promise<void> {
  const db = await openAutoBackupDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUTO_BACKUP_STORE, "readwrite");
    tx.objectStore(AUTO_BACKUP_STORE).delete(AUTO_BACKUP_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export interface AutoBackupLastWrites {
  regulier: Date | null;
  min15: Date | null;
  heure: Date | null;
  jour: Date | null;
  semaine: Date | null;
  excel: Date | null;
}

export async function idbGetLastWrites(): Promise<AutoBackupLastWrites> {
  const db = await openAutoBackupDb();
  return new Promise(resolve => {
    const tx = db.transaction(AUTO_BACKUP_STORE, "readonly");
    const store = tx.objectStore(AUTO_BACKUP_STORE);
    const reqReg = store.get("last_write_regulier");
    const req15 = store.get("last_write_15min");
    const reqH = store.get("last_write_heure");
    const reqJ = store.get("last_write_jour");
    const reqS = store.get("last_write_semaine");
    const reqE = store.get("last_write_excel");

    let doneCount = 0;
    const res: AutoBackupLastWrites = {
      regulier: null,
      min15: null,
      heure: null,
      jour: null,
      semaine: null,
      excel: null
    };

    const checkDone = () => {
      doneCount++;
      if (doneCount === 6) resolve(res);
    };

    reqReg.onsuccess = () => {
      if (reqReg.result) res.regulier = new Date(reqReg.result);
      checkDone();
    };
    reqReg.onerror = checkDone;
    req15.onsuccess = () => {
      if (req15.result) res.min15 = new Date(req15.result);
      checkDone();
    };
    req15.onerror = checkDone;
    reqH.onsuccess = () => {
      if (reqH.result) res.heure = new Date(reqH.result);
      checkDone();
    };
    reqH.onerror = checkDone;
    reqJ.onsuccess = () => {
      if (reqJ.result) res.jour = new Date(reqJ.result);
      checkDone();
    };
    reqJ.onerror = checkDone;
    reqS.onsuccess = () => {
      if (reqS.result) res.semaine = new Date(reqS.result);
      checkDone();
    };
    reqS.onerror = checkDone;
    reqE.onsuccess = () => {
      if (reqE.result) res.excel = new Date(reqE.result);
      checkDone();
    };
    reqE.onerror = checkDone;
  });
}

export async function idbSetLastWrite(key: string, date: Date): Promise<void> {
  const db = await openAutoBackupDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUTO_BACKUP_STORE, "readwrite");
    tx.objectStore(AUTO_BACKUP_STORE).put(date.getTime(), key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbClearAllLastWrites(): Promise<void> {
  const db = await openAutoBackupDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUTO_BACKUP_STORE, "readwrite");
    const store = tx.objectStore(AUTO_BACKUP_STORE);
    store.delete("last_write_regulier");
    store.delete("last_write_15min");
    store.delete("last_write_heure");
    store.delete("last_write_jour");
    store.delete("last_write_semaine");
    store.delete("last_write_excel");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
