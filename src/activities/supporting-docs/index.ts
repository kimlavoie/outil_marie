/**
 * activities/supporting-docs/index.ts - Linking an activity's pièces justificatives folder via the
 * File System Access API (Chrome/Edge only, read-only), and the resulting status/list UI.
 *
 * Barrel re-exporting db.ts (the tiny IndexedDB folder-link store), actions.ts (the File System
 * Access workflows) and status.ts (the status/list row UI) under this shared import path, the same
 * pattern used by src/activities/file-links/index.ts.
 *
 * Renders into #supporting-docs-status, a container living inside the activity drawer's "Pièces
 * justificatives" tab.
 */
export { idbSetSupportingDocsFolder } from "./db.ts";
export { renderSupportingDocsStatus } from "./status.ts";
