/**
 * activities-financials.ts - Barrel re-exporting the financial-summary/print-sheet/drawer/
 * distribution-rows/autosave modules under their original import path, so existing importers
 * (activities-history.ts, main.ts, navigation.ts, calendar-view.tsx, reconciliation-view.tsx,
 * contract-generator.ts) don't need to change.
 */
export {
  computeFormRevenueSubtotal,
  updateSubmissionFinancialSummary,
  computeActivityFinancials,
  updateDistributionTotal
} from "./financial-summary.ts";
export {
  buildPrintActivitySheetHtml,
  printActivitySheet,
  buildActivityDetailsHtml,
  openActivityDetailsModal,
  closeActivityDetailsModal,
  initActivityDetailsModal
} from "./print-sheet.ts";
export {
  generateNextActivityId,
  openActivityDrawer,
  openActivityDetailModal,
  closeActivityDrawer,
  cancelActivityDrawer,
  persistDrawerUiState,
  clearDrawerUiState,
  getSavedDrawerUiState
} from "./drawer.ts";
export { addDistributionRow } from "./distribution-rows.ts";
export { openTaxOverrideModal, closeTaxOverrideModal, initTaxOverrideModal } from "./tax-override.ts";
export {
  showAutoSaveStatus,
  autoSaveActivityForm,
  activityUndoSnapshotTimer,
  ACTIVITY_UNDO_DEBOUNCE_MS,
  setActivityUndoSnapshotTimer
} from "./autosave.ts";
