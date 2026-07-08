/**
 * db-utils.ts - Shared helper for opening a versioned IndexedDB database.
 *
 * All local IndexedDB stores previously opened with a hardcoded version (1) and no upgrade
 * path beyond "create the store if missing". That works for the very first schema, but the
 * next time a store needs to change shape, there was no place to hook a real migration step.
 * `openVersionedDb` gives every store a version-gated `onupgradeneeded` driven by
 * `event.oldVersion`, so future schema changes can be added as `if (oldVersion < N)` blocks
 * without disturbing data written under earlier versions.
 */
import { logError } from "../utils/logger.ts";

// Opens `name` at `version`, calling `upgrade(db, oldVersion, newVersion)` inside the
// browser-managed upgrade transaction whenever the stored version is behind. `upgrade` should
// be written as a sequence of `if (oldVersion < N) { ... }` steps, one per past version bump.
function openVersionedDb(name: string, version: number, upgrade: (db: IDBDatabase, oldVersion: number, newVersion: number | null) => void) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = event => {
      try {
        upgrade(req.result, event.oldVersion, event.newVersion);
      } catch (e) {
        logError("db-utils", `migration de la base ${name} (v${event.oldVersion} -> v${event.newVersion})`, e);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export { openVersionedDb };
