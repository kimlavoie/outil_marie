/**
 * activities/supporting-docs/db.ts - Tiny IndexedDB store mapping a generated link id to the
 * FileSystemDirectoryHandle it points at (plus the folder's display name), so a linked
 * supporting-documents folder survives page reloads. Separate database from
 * file-links/db.ts (outil_marie_file_links) since a folder handle isn't a file handle and mixing
 * the two shapes in one store buys nothing.
 */
import { openVersionedDb } from "../../state/db-utils.ts";

const SUPPORTING_DOCS_DB_NAME = "outil_marie_supporting_docs";
const SUPPORTING_DOCS_STORE_NAME = "folders";
const SUPPORTING_DOCS_DB_VERSION = 1;

function upgradeSupportingDocsDb(db: IDBDatabase, oldVersion: number) {
  if (oldVersion < 1 && !db.objectStoreNames.contains(SUPPORTING_DOCS_STORE_NAME)) {
    db.createObjectStore(SUPPORTING_DOCS_STORE_NAME);
  }
}

function openSupportingDocsDb() {
  return openVersionedDb(SUPPORTING_DOCS_DB_NAME, SUPPORTING_DOCS_DB_VERSION, upgradeSupportingDocsDb);
}

async function idbSetSupportingDocsFolder(id: string, record: any) {
  const db = await openSupportingDocsDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SUPPORTING_DOCS_STORE_NAME, "readwrite");
    tx.objectStore(SUPPORTING_DOCS_STORE_NAME).put(record, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetSupportingDocsFolder(id: string): Promise<{ handle: any; name: string } | null> {
  const db = await openSupportingDocsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SUPPORTING_DOCS_STORE_NAME, "readonly");
    const req = tx.objectStore(SUPPORTING_DOCS_STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export { idbSetSupportingDocsFolder, idbGetSupportingDocsFolder };
