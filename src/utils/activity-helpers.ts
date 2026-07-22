/**
 * activity-helpers.ts - appState-dependent read helpers for activities/reservations/rooms shared
 * across views (references, room totals/labels/colors, GL account options). Split out of
 * utils.ts (see that file for why it stays a barrel re-exporting this alongside the
 * format/DOM/searchable-select helper modules) — the real circular import with state.ts (state.ts
 * imports generateUid/calculateDaysCount from format.ts) is unaffected by this split.
 */
import { appState } from "../state/state.ts";
import { escapeHtml, calculateHoursFromTimes } from "./format.ts";

// Joined list of distinct RI/Facture references across an activity's per-account distributions
function getActivityReferences(act: any) {
  const refs = (act.distributions || []).map((d: any) => (d.reference || "").trim()).filter(Boolean);
  return [...new Set(refs)].join(", ");
}

// Sum of tarif_amount × duration (days or hours depending on room settings) across all reservations
// booked for an activity
function getRoomsTariffTotal(act: any) {
  return (act.reservations || []).reduce((sum: number, r: any) => {
    const room = appState.settings.rooms.find((rm: any) => rm.name === r.room_name);
    const isHourly = room && room.rate_type === "hourly";
    if (isHourly) {
      const hours = (r.slots || []).reduce((slotSum: number, s: any) => {
        return slotSum + calculateHoursFromTimes(s.start_time, s.end_time);
      }, 0);
      return sum + (r.tariff_amount || 0) * hours;
    } else {
      return sum + (r.tariff_amount || 0) * (r.slots || []).length;
    }
  }, 0);
}

// Sentinel room_name value for a reservation on a room outside the settings configuration
// (user-entered free text kept in reservation.room_other_details)
const OTHER_ROOM_VALUE = "__other__";

// Display label for a reservation's room: the free-text detail for "Autre", otherwise its name
function getReservationRoomLabel(reservation: any) {
  if (!reservation) return "";
  if (reservation.room_name === OTHER_ROOM_VALUE) return reservation.room_other_details || "Autre";
  return reservation.room_name || "";
}

// Short label for a reservation's room, for compact displays (activities list table): the
// room's configured "Diminutif" if set, otherwise falls back to the full name/label
function getReservationRoomAbbreviation(reservation: any) {
  if (!reservation) return "";
  if (reservation.room_name === OTHER_ROOM_VALUE) return reservation.room_other_details || "Autre";
  const room = appState.settings.rooms.find((r: any) => r.name === reservation.room_name);
  return (room && room.abbreviation) || reservation.room_name || "";
}

// Room color, with a stable fallback for rooms saved before the color picker existed
const FALLBACK_ROOM_COLORS = ["#4f46e5", "#059669", "#d97706", "#db2777", "#0891b2", "#7c3aed", "#dc2626", "#65a30d"];
function getRoomColor(name: string) {
  const room = appState.settings.rooms.find((r: any) => r.name === name);
  if (room && room.color) return room.color;
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return FALLBACK_ROOM_COLORS[Math.abs(hash) % FALLBACK_ROOM_COLORS.length];
}

// Fills a <select> with every configured GL account, keeping `selectedCode` selected if given.
// Used by plain-HTML consumers (activities-reservations.ts's "autre frais" row) that build a
// <select> as a markup string rather than JSX — js/settings-view.tsx has its own React
// <GlAccountOptions> equivalent for its own forms, since it doesn't need an HTML string.
function buildGlAccountOptionsHtml(selectedCode = "") {
  let html = '<option value="">Aucun</option>';
  appState.settings.accounts.forEach((acc: any) => {
    html += `<option value="${acc.code}" ${acc.code === selectedCode ? "selected" : ""}>${acc.code} (${escapeHtml(acc.description)})</option>`;
  });
  return html;
}

// Sum of setup/teardown fees across all reservations booked for an activity
function getSetupTeardownTotal(act: any) {
  return (act.reservations || []).reduce((sum: number, r: any) => {
    const room = appState.settings.rooms.find((rm: any) => rm.name === r.room_name);
    return sum + (room && typeof room.setup_fee === "number" ? room.setup_fee : 0);
  }, 0);
}

export {
  getActivityReferences,
  getRoomsTariffTotal,
  getSetupTeardownTotal,
  OTHER_ROOM_VALUE,
  getReservationRoomLabel,
  getReservationRoomAbbreviation,
  getRoomColor,
  FALLBACK_ROOM_COLORS,
  buildGlAccountOptionsHtml
};
