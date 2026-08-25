/**
 * activities/file-links/index.ts - Linking an activity submission/contract/form to a file on disk
 * via the File System Access API (Chrome/Edge only), and the resulting status UI.
 *
 * Barrel re-exporting db.ts (the tiny IndexedDB link store), actions.ts (the File System Access
 * workflows), status.ts (the status row UI) and preview.ts (the inline PDF/XLSX preview) under
 * this shared import path (the same pattern used by src/services/backup/index.ts and
 * src/activities/reservations/index.ts) — split out because the original file mixed those 4
 * largely independent concerns, including two near-identical PDF/XLSX preview implementations, in
 * one 570-line module.
 *
 * Renders into #submission-file-status/#contract-file-status/#form-file-status, containers that
 * live inside the activity form/drawer — so like js/datepicker.ts and js/activities-form.ts, this
 * stays a plain TS module (Phase 2 style) rather than a React component until Réservations gets
 * its own turn.
 */
export { idbSetFileLink, idbGetFileLink } from "./db.ts";
export { pickAndLinkFile } from "./actions.ts";
export { renderFileLinkStatus } from "./status.ts";
export { renderPdfPreview, renderXlsxPreview } from "./preview.ts";
