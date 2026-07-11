/**
 * activities/file-links/db.ts - Tiny IndexedDB store mapping a generated link id to the
 * FileSystemFileHandle it points at (plus the file's display name), so a linked file survives
 * page reloads. Split out of index.ts (see that file for why it stays a barrel importing/
 * re-exporting this alongside actions.ts/status.ts/preview.ts).
 */
import { openVersionedDb } from "../../state/db-utils.ts";

const FILE_LINKS_DB_NAME = "outil_marie_file_links";
const FILE_LINKS_STORE_NAME = "links";
const FILE_LINKS_DB_VERSION = 1;

function upgradeFileLinksDb(db: IDBDatabase, oldVersion: number) {
  if (oldVersion < 1 && !db.objectStoreNames.contains(FILE_LINKS_STORE_NAME)) {
    db.createObjectStore(FILE_LINKS_STORE_NAME);
  }
}

function openFileLinksDb() {
  return openVersionedDb(FILE_LINKS_DB_NAME, FILE_LINKS_DB_VERSION, upgradeFileLinksDb);
}

async function idbSetFileLink(id: string, record: any) {
  const db = await openFileLinksDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FILE_LINKS_STORE_NAME, "readwrite");
    tx.objectStore(FILE_LINKS_STORE_NAME).put(record, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetFileLink(id: string): Promise<{ handle: any; name: string } | null> {
  const db = await openFileLinksDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_LINKS_STORE_NAME, "readonly");
    const req = tx.objectStore(FILE_LINKS_STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export { openFileLinksDb, idbSetFileLink, idbGetFileLink };
