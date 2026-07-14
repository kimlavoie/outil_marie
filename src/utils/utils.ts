/**
 * utils.ts - Barrel re-exporting format.ts/activity-helpers.ts/dom-helpers.ts/select-helpers.ts/
 * searchable-select.ts under their original shared import path, so existing importers don't need
 * to change (the same pattern used by src/services/backup/index.ts and
 * src/activities/reservations/index.ts). Split out because the original file mixed formatting,
 * appState-dependent activity/room helpers, generic DOM controls, multi-select filters, and the
 * searchable-select control in one 700+-line module.
 *
 * activity-helpers.ts depends on state.ts (appState) — a real circular import, since state.ts
 * itself imports generateUid/calculateDaysCount from format.ts; safe since nothing runs during
 * either module's top-level evaluation, same as the other circular imports already in this
 * codebase.
 */
export {
  formatCurrency,
  escapeHtml,
  generateUid,
  rateToPercentString,
  newRateVersionRow,
  calculateDaysCount,
  calculateHoursFromTimes,
  formatDateMask,
  maskDateInput,
  formatTimeMask,
  maskTimeInput,
  maskPhoneInput
} from "./format.ts";
export type { RateVersionRow } from "./format.ts";
export {
  getActivityReferences,
  getRoomsTariffTotal,
  OTHER_ROOM_VALUE,
  getReservationRoomLabel,
  getReservationRoomAbbreviation,
  getRoomColor,
  FALLBACK_ROOM_COLORS,
  buildGlAccountOptionsHtml
} from "./activity-helpers.ts";
export {
  elById,
  debounce,
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
  showLoadingOverlay,
  hideLoadingOverlay,
  showToast,
  rejectNegativeAmountOnBlur
} from "./dom-helpers.ts";
export { getMultiSelectValues, setMultiSelectValues, updateMultiSelectLabel, initMultiSelectDropdown } from "./select-helpers.ts";
export { buildSearchableSelectHtml, initSearchableSelectEl } from "./searchable-select.ts";
