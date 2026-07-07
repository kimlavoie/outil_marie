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
import type { renderSettings, openSettingsPanel, openAccountModal, openDeptModal } from "./settings-view.tsx";
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
