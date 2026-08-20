/**
 * activities/history/room-conflicts.ts - Form "dates helper" text and cross-activity
 * room-booking conflict detection. Split out of index.ts (see that file for why it stays a
 * barrel importing/re-exporting this alongside undo.ts/version-history.ts).
 */
import { appState, parseLocalDateStr } from "../../state/state.ts";
import { escapeHtml, OTHER_ROOM_VALUE } from "../../utils/utils.ts";
import { collectReservationsFromForm } from "../reservations/index.ts";

function updateFormDatesHelper() {
  const reservations = collectReservationsFromForm();

  const cards = document.querySelectorAll<HTMLElement>("#form-activity-reservations .reservation-card");
  cards.forEach((card, i) => {
    const helperEl = card.querySelector<HTMLElement>(".reservation-slots-days-helper");
    const listEl = card.querySelector<HTMLElement>(".reservation-slots-days-list");
    if (!helperEl || !listEl) return;

    const dates = ((reservations[i] && reservations[i].slots) || []).map((s: any) => s.date).filter(Boolean);
    const startVal = dates.length ? dates.reduce((min: string, d: string) => (d < min ? d : min)) : "";
    const endVal = dates.length ? dates.reduce((max: string, d: string) => (d > max ? d : max)) : "";
    const daysText = getDaysOfWeekInRange(startVal, endVal);
    if (daysText) {
      listEl.textContent = daysText;
      helperEl.style.display = "flex";
    } else {
      helperEl.style.display = "none";
    }
  });

  checkRoomReservationConflicts(reservations);
}

// Returns true if two "HH:MM" time ranges on the same day overlap. A missing start/end time is
// treated as spanning the whole day (conservative: flags a conflict rather than missing one).
function timeRangesOverlap(startA: string, endA: string, startB: string, endB: string) {
  const a1 = startA || "00:00";
  const a2 = endA || "23:59";
  const b1 = startB || "00:00";
  const b2 = endB || "23:59";
  return a1 < b2 && b1 < a2;
}

// Flattens a reservation into a list of {date, start_time, end_time} occupied ranges: its
// créneaux plus its montage/démontage windows (a room is unavailable during setup/teardown too).
function getReservationOccupiedRanges(reservation: any) {
  const ranges = (reservation.slots || [])
    .filter((s: any) => s.date)
    .map((s: any) => ({ date: s.date, start_time: s.start_time, end_time: s.end_time }));
  if (reservation.install && reservation.install.enabled && reservation.install.date) {
    ranges.push({ date: reservation.install.date, start_time: reservation.install.start_time, end_time: reservation.install.end_time });
  }
  if (reservation.dismantle && reservation.dismantle.enabled && reservation.dismantle.date) {
    ranges.push({
      date: reservation.dismantle.date,
      start_time: reservation.dismantle.start_time,
      end_time: reservation.dismantle.end_time
    });
  }
  return ranges;
}

// Compares the reservations currently in the activity form against every other non-deleted
// activity's reservations, and displays a warning banner listing any room booked by both on an
// overlapping date/time. Runs on every form change that can affect scheduling (room, créneaux,
// montage/démontage).
function checkRoomReservationConflicts(reservations: any[]) {
  const bannerEl = document.getElementById("form-activity-room-conflicts");
  if (!bannerEl) return;

  // The banner lives inside the collapsible "Réservation de salles" accordion — if it's collapsed,
  // a conflict could go completely unseen. The check mark next to the section title stays visible
  // even when collapsed, so it also gets an unmissable "conflict" state alongside the banner.
  const checkEl = document.getElementById("accordion-check-rooms");
  const sectionEl = document.getElementById("accordion-section-rooms") as HTMLDetailsElement | null;

  const currentId = (document.getElementById("form-activity-internal-id") as HTMLInputElement).value;
  const conflicts: { roomName: string; otherActivityName: string }[] = [];

  // Filter valid room reservations with occupied ranges
  const validReservations = reservations
    .filter((res: any) => res.room_name && res.room_name !== OTHER_ROOM_VALUE)
    .map((res: any) => ({ roomName: res.room_name, myRanges: getReservationOccupiedRanges(res) }))
    .filter(item => item.myRanges.length > 0);

  if (validReservations.length === 0) {
    bannerEl.style.display = "none";
    bannerEl.innerHTML = "";
    if (checkEl) {
      checkEl.classList.remove("conflict");
      checkEl.removeAttribute("title");
    }
    return;
  }

  validReservations.forEach(({ roomName, myRanges }) => {
    appState.activities.forEach((other: any) => {
      if (other.deleted || other.id === currentId) return;
      (other.reservations || []).forEach((otherRes: any) => {
        if (otherRes.room_name !== roomName) return;
        const otherRanges = getReservationOccupiedRanges(otherRes);
        const overlaps = myRanges.some((mr: any) =>
          otherRanges.some((or: any) => mr.date === or.date && timeRangesOverlap(mr.start_time, mr.end_time, or.start_time, or.end_time))
        );
        if (overlaps && !conflicts.some(c => c.roomName === roomName && c.otherActivityName === other.name)) {
          conflicts.push({ roomName, otherActivityName: other.name || "(sans nom)" });
        }
      });
    });
  });

  if (conflicts.length === 0) {
    bannerEl.style.display = "none";
    bannerEl.innerHTML = "";
    if (checkEl) {
      checkEl.classList.remove("conflict");
      checkEl.removeAttribute("title");
    }
    return;
  }

  bannerEl.style.display = "block";
  bannerEl.innerHTML = `
    <div class="room-conflict-banner">
      <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; flex-shrink: 0;"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
      <div>
        <strong>Conflit de réservation détecté :</strong>
        <ul style="margin: 4px 0 0 18px; padding: 0;">
          ${conflicts.map(c => `<li>${escapeHtml(c.roomName)} — également réservée par « ${escapeHtml(c.otherActivityName)} »</li>`).join("")}
        </ul>
      </div>
    </div>
  `;

  if (checkEl) {
    checkEl.classList.add("conflict");
    checkEl.setAttribute("title", "Conflit de réservation détecté");
  }
  // Force the accordion open so a conflict can never be hidden behind a collapsed section.
  if (sectionEl && !sectionEl.open) {
    sectionEl.open = true;
  }
}

function getDaysOfWeekInRange(startDateStr: string, endDateStr: string) {
  if (!startDateStr || !endDateStr) return "";

  const start = parseLocalDateStr(startDateStr);
  const end = parseLocalDateStr(endDateStr);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return "";
  }

  // French day names
  const dayNames = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

  const uniqueDays = new Set<number>();
  const current = new Date(start);

  // Limit loop to prevent freezing if dates are extremely far apart (e.g. max 31 days)
  const maxIterations = 31;
  let iterations = 0;

  while (current <= end && iterations < maxIterations) {
    uniqueDays.add(current.getDay());
    current.setDate(current.getDate() + 1);
    iterations++;
  }

  // Sort day indexes (1=lundi, 2=mardi, ... 6=samedi, 0=dimanche)
  const sortedDays = Array.from(uniqueDays).sort((a, b) => {
    const orderA = a === 0 ? 7 : a;
    const orderB = b === 0 ? 7 : b;
    return orderA - orderB;
  });

  const dayStrings = sortedDays.map(d => dayNames[d]);

  if (iterations >= maxIterations) {
    return "Tous les jours de la semaine";
  }

  return dayStrings.join(", ");
}

export { updateFormDatesHelper, timeRangesOverlap, getReservationOccupiedRanges, checkRoomReservationConflicts, getDaysOfWeekInRange };
