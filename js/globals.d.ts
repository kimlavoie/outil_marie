// Ambient declarations for the legacy `window.X = X` bridges that let plain, non-module
// <script> files (navigation.js, activities-form.js, settings.js, etc. — see index.html) read
// exports from ES modules as globals. TypeScript's DOM lib doesn't know about these ad hoc
// properties, so each module that bridges something to `window` needs an entry here.
//
// This file doubles as a manifest of what still needs to move to real imports/removal by
// Phase 4-5 of the Vite/React/TS migration (see TODO.txt) — don't let it grow silently.

import type { DEFAULT_CONFIG } from "./config-defaults.ts";
import type { FUZZY_TEXT_STOPWORDS, tokenizeForMatch, textSimilarity } from "./fuzzy-match.ts";
import type { openVersionedDb } from "./db-utils.ts";
import type {
  isNonEmptyString,
  isPlainObject,
  isFiniteNumber,
  isValidAmount,
  requireNonEmpty,
  validateRules
} from "./validation.ts";
import type { logError, logWarn, logInfo, getLogHistory } from "./logger.ts";
import type { renderDashboard, renderDashboardCharts } from "./dashboard-view.tsx";
import type { renderSettings, openSettingsPanel, openAccountModal, openDeptModal, closeAllSettingsModals } from "./settings-view.tsx";
import type { initCalendarModal, initViewCalendarButtons, openCalendarModal, openCalendarAtDate, reopenCalendarModal } from "./calendar-view.tsx";
import type {
  validateDateFieldFiscalYear,
  clearDateFieldErrors,
  initCustomDatepickers,
  initDatepickerWrapper
} from "./datepicker.ts";
import type { renderFileLinkStatus, pickAndLinkFile, openLinkedFile } from "./activities-file-links.ts";
import type {
  timeRangesOverlap,
  getReservationOccupiedRanges,
  computeActivityDiff,
  scheduleActivityUndoSnapshot,
  pushActivityUndoSnapshot,
  restoreActivitySnapshot,
  undoActivityFormChange,
  redoActivityFormChange,
  submitActivityForm,
  initActivitiesSort,
  updateFormDatesHelper,
  checkRoomReservationConflicts,
  getDaysOfWeekInRange,
  formatTimestampToFrench,
  saveActivityVersion,
  loadAndRenderActivityHistory,
  restoreActivityVersion
} from "./activities-history.ts";
import type {
  computeActivityFinancials,
  updateSubmissionFinancialSummary,
  buildPrintActivitySheetHtml,
  printActivitySheet,
  generateNextActivityId,
  openActivityDrawer,
  openActivityDetailModal,
  closeActivityDrawer,
  cancelActivityDrawer,
  addDistributionRow,
  updateDistributionTotal,
  showAutoSaveStatus,
  autoSaveActivityForm
} from "./activities-financials.ts";
import type {
  activitiesState,
  ACTIVITY_STATES,
  ACTIVITY_UNDO_HISTORY_LIMIT,
  newActivityModalIntent,
  getActivityStateLabel,
  getActivityStateBadgeClass,
  getPlanningProgress,
  buildProgressBarHtml,
  renderActivities,
  updateBulkActionsBar,
  initBulkActionsHandlers
} from "./activities-render.ts";
import type {
  initFormHandlers,
  initNewActivityModal,
  createActivity,
  createDraftActivity,
  duplicateActivityAndOpen,
  getActivityFormMode,
  switchActivityTab,
  renderActivityStateBar,
  commitActivityPatch,
  fillActivityFormFields,
  WEEKDAY_PILL_OPTIONS
} from "./activities-form.ts";
import type {
  getAggregateEventDates,
  buildRoomSelectItems,
  initReservationsSection,
  buildRoomDateTimeFieldHtml,
  buildDatePeriodFieldHtml,
  buildTariffParameterOptionsHtml,
  buildTariffClientTypeOptionsHtml,
  updateResolvedPriceDisplay,
  refreshReservationTariffSelect,
  addSlotRow,
  collectSlotsFromCard,
  addNextSlotRow,
  buildSlotRangeGeneratorHtml,
  wireSlotRangeGenerator,
  addReservationCard,
  collectReservationsFromForm,
  addStaffRow,
  updateStaffRowSubtotal,
  addServiceRow,
  updateServiceRowSubtotal,
  addFeeRow,
  autoAddLinkedStaffAndFees,
  collectStaffFromForm,
  collectServicesFromForm,
  collectFeesFromForm
} from "./activities-reservations.ts";
import type {
  formatCurrency,
  escapeHtml,
  generateUid,
  debounce,
  calculateDaysCount,
  getActivityReferences,
  getRoomsTariffTotal,
  OTHER_ROOM_VALUE,
  getReservationRoomLabel,
  getRoomColor,
  buildGlAccountOptionsHtml,
  buildPaginationBarHtml,
  renderPaginationBar,
  setPillGroupActiveEl,
  setPillGroupActive,
  initPillToggleEl,
  initPillToggle,
  initExclusivePillToggleEl,
  initExclusivePillToggle,
  getExclusivePillValueEl,
  getExclusivePillValue,
  setExclusivePillValueEl,
  setExclusivePillValue,
  buildSearchableSelectHtml,
  initSearchableSelectEl,
  maskDateInput,
  maskPhoneInput,
  showToast,
  showLoadingOverlay,
  hideLoadingOverlay
} from "./utils.ts";
// utils.ts reads `appState` as a bare global (set by state.js — see state.js's own window
// bridging), not via `window.appState`, so it needs a plain `declare global { const appState }`
// rather than a Window property.
import type { appState as AppStateValue } from "./state.js";

declare global {
  const appState: AppStateValue;

  interface Window {
    DEFAULT_CONFIG: typeof DEFAULT_CONFIG;
    FUZZY_TEXT_STOPWORDS: typeof FUZZY_TEXT_STOPWORDS;
    tokenizeForMatch: typeof tokenizeForMatch;
    textSimilarity: typeof textSimilarity;
    openVersionedDb: typeof openVersionedDb;
    isNonEmptyString: typeof isNonEmptyString;
    isPlainObject: typeof isPlainObject;
    isFiniteNumber: typeof isFiniteNumber;
    isValidAmount: typeof isValidAmount;
    requireNonEmpty: typeof requireNonEmpty;
    validateRules: typeof validateRules;
    logError: typeof logError;
    logWarn: typeof logWarn;
    logInfo: typeof logInfo;
    getLogHistory: typeof getLogHistory;
    formatCurrency: typeof formatCurrency;
    escapeHtml: typeof escapeHtml;
    generateUid: typeof generateUid;
    debounce: typeof debounce;
    calculateDaysCount: typeof calculateDaysCount;
    getActivityReferences: typeof getActivityReferences;
    getRoomsTariffTotal: typeof getRoomsTariffTotal;
    OTHER_ROOM_VALUE: typeof OTHER_ROOM_VALUE;
    getReservationRoomLabel: typeof getReservationRoomLabel;
    getRoomColor: typeof getRoomColor;
    buildGlAccountOptionsHtml: typeof buildGlAccountOptionsHtml;
    buildPaginationBarHtml: typeof buildPaginationBarHtml;
    renderPaginationBar: typeof renderPaginationBar;
    setPillGroupActiveEl: typeof setPillGroupActiveEl;
    setPillGroupActive: typeof setPillGroupActive;
    initPillToggleEl: typeof initPillToggleEl;
    initPillToggle: typeof initPillToggle;
    initExclusivePillToggleEl: typeof initExclusivePillToggleEl;
    initExclusivePillToggle: typeof initExclusivePillToggle;
    getExclusivePillValueEl: typeof getExclusivePillValueEl;
    getExclusivePillValue: typeof getExclusivePillValue;
    setExclusivePillValueEl: typeof setExclusivePillValueEl;
    setExclusivePillValue: typeof setExclusivePillValue;
    buildSearchableSelectHtml: typeof buildSearchableSelectHtml;
    initSearchableSelectEl: typeof initSearchableSelectEl;
    maskDateInput: typeof maskDateInput;
    maskPhoneInput: typeof maskPhoneInput;
    showToast: typeof showToast;
    showLoadingOverlay: typeof showLoadingOverlay;
    hideLoadingOverlay: typeof hideLoadingOverlay;
    renderDashboard: typeof renderDashboard;
    renderDashboardCharts: typeof renderDashboardCharts;
    renderSettings: typeof renderSettings;
    openSettingsPanel: typeof openSettingsPanel;
    openAccountModal: typeof openAccountModal;
    openDeptModal: typeof openDeptModal;
    closeAllSettingsModals: typeof closeAllSettingsModals;
    initCalendarModal: typeof initCalendarModal;
    initViewCalendarButtons: typeof initViewCalendarButtons;
    openCalendarModal: typeof openCalendarModal;
    openCalendarAtDate: typeof openCalendarAtDate;
    reopenCalendarModal: typeof reopenCalendarModal;
    validateDateFieldFiscalYear: typeof validateDateFieldFiscalYear;
    clearDateFieldErrors: typeof clearDateFieldErrors;
    initCustomDatepickers: typeof initCustomDatepickers;
    initDatepickerWrapper: typeof initDatepickerWrapper;
    renderFileLinkStatus: typeof renderFileLinkStatus;
    pickAndLinkFile: typeof pickAndLinkFile;
    openLinkedFile: typeof openLinkedFile;
    // File System Access API (Chrome/Edge only) — not yet in TS's default DOM lib types.
    showOpenFilePicker?: () => Promise<any[]>;
    timeRangesOverlap: typeof timeRangesOverlap;
    getReservationOccupiedRanges: typeof getReservationOccupiedRanges;
    computeActivityDiff: typeof computeActivityDiff;
    scheduleActivityUndoSnapshot: typeof scheduleActivityUndoSnapshot;
    pushActivityUndoSnapshot: typeof pushActivityUndoSnapshot;
    restoreActivitySnapshot: typeof restoreActivitySnapshot;
    undoActivityFormChange: typeof undoActivityFormChange;
    redoActivityFormChange: typeof redoActivityFormChange;
    submitActivityForm: typeof submitActivityForm;
    initActivitiesSort: typeof initActivitiesSort;
    updateFormDatesHelper: typeof updateFormDatesHelper;
    checkRoomReservationConflicts: typeof checkRoomReservationConflicts;
    getDaysOfWeekInRange: typeof getDaysOfWeekInRange;
    formatTimestampToFrench: typeof formatTimestampToFrench;
    saveActivityVersion: typeof saveActivityVersion;
    loadAndRenderActivityHistory: typeof loadAndRenderActivityHistory;
    restoreActivityVersion: typeof restoreActivityVersion;
    computeActivityFinancials: typeof computeActivityFinancials;
    updateSubmissionFinancialSummary: typeof updateSubmissionFinancialSummary;
    buildPrintActivitySheetHtml: typeof buildPrintActivitySheetHtml;
    printActivitySheet: typeof printActivitySheet;
    generateNextActivityId: typeof generateNextActivityId;
    openActivityDrawer: typeof openActivityDrawer;
    openActivityDetailModal: typeof openActivityDetailModal;
    closeActivityDrawer: typeof closeActivityDrawer;
    cancelActivityDrawer: typeof cancelActivityDrawer;
    addDistributionRow: typeof addDistributionRow;
    updateDistributionTotal: typeof updateDistributionTotal;
    showAutoSaveStatus: typeof showAutoSaveStatus;
    autoSaveActivityForm: typeof autoSaveActivityForm;
    activitiesState: typeof activitiesState;
    ACTIVITY_STATES: typeof ACTIVITY_STATES;
    ACTIVITY_UNDO_HISTORY_LIMIT: typeof ACTIVITY_UNDO_HISTORY_LIMIT;
    newActivityModalIntent: typeof newActivityModalIntent;
    getActivityStateLabel: typeof getActivityStateLabel;
    getActivityStateBadgeClass: typeof getActivityStateBadgeClass;
    getPlanningProgress: typeof getPlanningProgress;
    buildProgressBarHtml: typeof buildProgressBarHtml;
    renderActivities: typeof renderActivities;
    updateBulkActionsBar: typeof updateBulkActionsBar;
    initBulkActionsHandlers: typeof initBulkActionsHandlers;
    initFormHandlers: typeof initFormHandlers;
    initNewActivityModal: typeof initNewActivityModal;
    createActivity: typeof createActivity;
    createDraftActivity: typeof createDraftActivity;
    duplicateActivityAndOpen: typeof duplicateActivityAndOpen;
    getActivityFormMode: typeof getActivityFormMode;
    switchActivityTab: typeof switchActivityTab;
    renderActivityStateBar: typeof renderActivityStateBar;
    commitActivityPatch: typeof commitActivityPatch;
    fillActivityFormFields: typeof fillActivityFormFields;
    WEEKDAY_PILL_OPTIONS: typeof WEEKDAY_PILL_OPTIONS;
    getAggregateEventDates: typeof getAggregateEventDates;
    buildRoomSelectItems: typeof buildRoomSelectItems;
    initReservationsSection: typeof initReservationsSection;
    buildRoomDateTimeFieldHtml: typeof buildRoomDateTimeFieldHtml;
    buildDatePeriodFieldHtml: typeof buildDatePeriodFieldHtml;
    buildTariffParameterOptionsHtml: typeof buildTariffParameterOptionsHtml;
    buildTariffClientTypeOptionsHtml: typeof buildTariffClientTypeOptionsHtml;
    updateResolvedPriceDisplay: typeof updateResolvedPriceDisplay;
    refreshReservationTariffSelect: typeof refreshReservationTariffSelect;
    addSlotRow: typeof addSlotRow;
    collectSlotsFromCard: typeof collectSlotsFromCard;
    addNextSlotRow: typeof addNextSlotRow;
    buildSlotRangeGeneratorHtml: typeof buildSlotRangeGeneratorHtml;
    wireSlotRangeGenerator: typeof wireSlotRangeGenerator;
    addReservationCard: typeof addReservationCard;
    collectReservationsFromForm: typeof collectReservationsFromForm;
    addStaffRow: typeof addStaffRow;
    updateStaffRowSubtotal: typeof updateStaffRowSubtotal;
    addServiceRow: typeof addServiceRow;
    updateServiceRowSubtotal: typeof updateServiceRowSubtotal;
    addFeeRow: typeof addFeeRow;
    autoAddLinkedStaffAndFees: typeof autoAddLinkedStaffAndFees;
    collectStaffFromForm: typeof collectStaffFromForm;
    collectServicesFromForm: typeof collectServicesFromForm;
    collectFeesFromForm: typeof collectFeesFromForm;
  }

  // populateDropdowns is a plain top-level function declaration in navigation.js (a non-module
  // <script>, not one of our window.X = X bridges), so it's a bare global rather than a
  // Window property — declared the same way as Chart/XLSX below.
  function populateDropdowns(): void;

  // Third-party vendored globals, loaded as plain <script> from lib/ (see index.html) — not our
  // bridges to clean up, just ambient so TS recognizes them where used (e.g. js/dashboard-view.tsx).
  const Chart: any;
  const XLSX: any;
}

export {};
