import { openVersionedDb } from "./db-utils.ts";

// --- IndexedDB Configuration for App State ---
const APP_DB_NAME = "outil_marie_app";
const APP_STORE_NAME = "app_state_store";
const APP_STATE_KEY = "app_state";

const APP_DB_VERSION = 4;
const SAFETY_BACKUPS_STORE = "safety_backups";
// How many automatic pre-destructive-operation snapshots to keep, oldest pruned first.
const SAFETY_BACKUPS_MAX = 5;

// Each block runs only for databases that haven't reached that version yet, so re-opening an
// already-migrated database is a no-op and a fresh database walks through every step in order.
function upgradeAppDb(db: IDBDatabase, oldVersion: number) {
  if (oldVersion < 1 && !db.objectStoreNames.contains(APP_STORE_NAME)) {
    db.createObjectStore(APP_STORE_NAME);
  }
  if (oldVersion < 2 && !db.objectStoreNames.contains("activity_versions")) {
    const store = db.createObjectStore("activity_versions", { keyPath: "versionId" });
    store.createIndex("activityId", "activityId", { unique: false });
  }
  if (oldVersion < 3 && !db.objectStoreNames.contains("recon_decisions")) {
    db.createObjectStore("recon_decisions", { keyPath: "key" });
  }
  if (oldVersion < 4 && !db.objectStoreNames.contains(SAFETY_BACKUPS_STORE)) {
    db.createObjectStore(SAFETY_BACKUPS_STORE, { keyPath: "id" });
  }
}

export function openAppDb(): Promise<IDBDatabase> {
  return openVersionedDb(APP_DB_NAME, APP_DB_VERSION, upgradeAppDb);
}

// Manually-reviewed reconciliation lines (validated/ignored), keyed by "account_code||reference"
// so the decision survives across GL re-imports (a new import produces the same key for the same
// account+référence pair). Kept in their own IndexedDB store rather than appState so they aren't
// wiped out by a JSON backup restore of unrelated activity data.
export function getReconDecisionsFromDb(): Promise<any[]> {
  return openAppDb().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("recon_decisions", "readonly");
      const store = tx.objectStore("recon_decisions");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  });
}

export function saveReconDecisionToDb(decision: any): Promise<void> {
  return openAppDb().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("recon_decisions", "readwrite");
      const store = tx.objectStore("recon_decisions");
      const req = store.put(decision);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}

export function deleteReconDecisionFromDb(key: string): Promise<void> {
  return openAppDb().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("recon_decisions", "readwrite");
      const store = tx.objectStore("recon_decisions");
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}

export function addActivityVersionToDb(versionRecord: any): Promise<void> {
  return openAppDb().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("activity_versions", "readwrite");
      const store = tx.objectStore("activity_versions");
      const req = store.put(versionRecord);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}

export function getActivityVersionsFromDb(activityId: string): Promise<any[]> {
  return openAppDb().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("activity_versions", "readonly");
      const store = tx.objectStore("activity_versions");
      const index = store.index("activityId");
      const req = index.getAll(activityId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  });
}

export function pruneActivityVersions(activityId: string, maxVersions: number = 20): Promise<void> {
  return getActivityVersionsFromDb(activityId).then(versions => {
    if (versions.length <= maxVersions) return Promise.resolve();

    // Sort oldest first to delete the oldest ones
    versions.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const toDelete = versions.slice(0, versions.length - maxVersions);

    return openAppDb().then(db => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction("activity_versions", "readwrite");
        const store = tx.objectStore("activity_versions");

        let count = 0;
        toDelete.forEach(v => {
          const req = store.delete(v.versionId);
          req.onsuccess = () => {
            count++;
            if (count === toDelete.length) resolve();
          };
          req.onerror = () => reject(req.error);
        });

        if (toDelete.length === 0) resolve();
      });
    });
  });
}

export function clearAllActivityVersionsFromDb(): Promise<void> {
  return openAppDb().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("activity_versions", "readwrite");
      const store = tx.objectStore("activity_versions");
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}

// Automatic safety net taken right before a destructive, hard-to-reverse operation (JSON
// restore overwriting everything, database reset, or a startup schema migration). Stored as its
// own IndexedDB entries (distinct from the regular app_state_store key) so it survives even if
// the operation it's guarding immediately overwrites the main app state, and pruned to the last
// few so it doesn't grow unbounded.
export function saveSafetyBackupToDb(label: string, snapshot: any): Promise<void> {
  const record = {
    id: `${Date.now()}_${label}`,
    label,
    timestamp: new Date().toISOString(),
    snapshot
  };
  return openAppDb()
    .then(db => {
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(SAFETY_BACKUPS_STORE, "readwrite");
        const store = tx.objectStore(SAFETY_BACKUPS_STORE);
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    })
    .then(() => pruneSafetyBackups());
}

export function getSafetyBackupsFromDb(): Promise<any[]> {
  return openAppDb().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SAFETY_BACKUPS_STORE, "readonly");
      const store = tx.objectStore(SAFETY_BACKUPS_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result || []).sort((a: any, b: any) => b.id.localeCompare(a.id)));
      req.onerror = () => reject(req.error);
    });
  });
}

function pruneSafetyBackups(maxCount: number = SAFETY_BACKUPS_MAX): Promise<void> {
  return getSafetyBackupsFromDb().then(records => {
    if (records.length <= maxCount) return Promise.resolve();
    const toDelete = records.slice(maxCount); // records are newest-first; drop the oldest overflow
    return openAppDb().then(db => {
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(SAFETY_BACKUPS_STORE, "readwrite");
        const store = tx.objectStore(SAFETY_BACKUPS_STORE);
        toDelete.forEach(r => store.delete(r.id));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    });
  });
}

export function getAppStateFromDb(): Promise<any | null> {
  return openAppDb().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(APP_STORE_NAME, "readonly");
      const store = tx.objectStore(APP_STORE_NAME);
      const req = store.get(APP_STATE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  });
}

export function saveAppStateToDb(state: any): Promise<void> {
  return openAppDb().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(APP_STORE_NAME, "readwrite");
      const store = tx.objectStore(APP_STORE_NAME);
      const req = store.put(state, APP_STATE_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}
