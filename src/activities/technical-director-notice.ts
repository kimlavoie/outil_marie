/**
 * activities/technical-director-notice.ts - "Envoyer au directeur technique" button logic: builds
 * an .ics calendar file covering the install/show/dismantle window of every reservation that has a
 * technical director assigned (see TECHNICAL_DIRECTOR_SALARY_ID in reservations/subrows.ts), then
 * hands it off to Outlook.
 *
 * There is no attachment API for mailto: links (a deliberate web-platform restriction — no site can
 * inject files into a user's email), so this can't produce a single "send" action. Instead:
 *   1. Try the Web Share API with the file attached (navigator.share) — on Edge/Windows with
 *      Outlook registered as a share target, this hands the .ics straight to a new message with no
 *      extra step from the user.
 *   2. If that isn't available (or the user cancels), fall back to downloading the .ics and opening
 *      a prefilled mailto: — the user just has to drag the file that was already downloaded into
 *      the message that opened.
 */
import { showToast } from "../utils/utils.ts";
import { TECHNICAL_DIRECTOR_SALARY_ID } from "./reservations/subrows.ts";

interface TechnicalDirectorWindow {
  reservationId: string;
  roomName: string;
  // ISO-ish "YYYY-MM-DDTHH:MM:SS" local strings (no timezone conversion — see buildIcsEvent).
  start: string;
  end: string;
  description: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// "YYYY-MM-DD" + "HH:MM" -> "YYYYMMDDTHHMMSS", the local (floating) time format ICS expects when
// no VTIMEZONE is provided. Falls back to a very cautious default time when the field is blank
// (which happens for a slot with a date but no explicit time), so the event never silently drops.
function toIcsLocalDateTime(date: string, time: string, fallbackTime: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = (time || fallbackTime).split(":").map(Number);
  return `${y}${pad2(m)}${pad2(d)}T${pad2(h)}${pad2(min)}00`;
}

function compareDateTime(a: { date: string; time: string }, b: { date: string; time: string }): number {
  return `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`);
}

// Every reservation with at least one "Directeur technique" row in its staff list that actually
// has hours booked — a row can be added (even auto-added, see TECHNICAL_DIRECTOR_SALARY_ID's doc
// comment in subrows.ts) before the user has filled in how many hours it covers, and until then
// there's no real schedule to send.
function getTechnicalDirectorReservations(act: any): any[] {
  return (act.reservations || []).filter((r: any) =>
    (r.staff || []).some((s: any) => s.salary_id === TECHNICAL_DIRECTOR_SALARY_ID && s.hours > 0)
  );
}

function activityHasTechnicalDirector(act: any): boolean {
  return getTechnicalDirectorReservations(act).length > 0;
}

// Builds the single window to block off for one reservation: from installation start (or the
// earliest slot if there's no install) to dismantle end (or the latest slot if there's no
// dismantle) — the technical director needs to be available for the whole span, not just the show
// itself. Returns null if the reservation has no dated slot/install/dismantle to anchor on.
function buildReservationWindow(reservation: any): TechnicalDirectorWindow | null {
  const slots = (reservation.slots || []).filter((s: any) => s.date);
  if (slots.length === 0 && !reservation.install?.enabled && !reservation.dismantle?.enabled) return null;

  const sortedSlots = slots.slice().sort(compareDateTime);
  const earliestSlot = sortedSlots[0];
  const latestSlot = sortedSlots[sortedSlots.length - 1];

  const start =
    reservation.install?.enabled && reservation.install.date
      ? { date: reservation.install.date, time: reservation.install.start_time || "00:00" }
      : { date: earliestSlot.date, time: earliestSlot.start_time || "00:00" };

  const end =
    reservation.dismantle?.enabled && reservation.dismantle.date
      ? { date: reservation.dismantle.date, time: reservation.dismantle.end_time || "23:59" }
      : { date: latestSlot ? latestSlot.date : start.date, time: (latestSlot && latestSlot.end_time) || "23:59" };

  const lines: string[] = [];
  if (reservation.install?.enabled) {
    lines.push(`Installation : ${reservation.install.date} ${reservation.install.start_time}–${reservation.install.end_time}`);
  }
  if (slots.length > 0) {
    lines.push(`Activité : ${slots.map((s: any) => `${s.date} ${s.start_time}–${s.end_time}`).join(", ")}`);
  }
  if (reservation.dismantle?.enabled) {
    lines.push(`Démontage : ${reservation.dismantle.date} ${reservation.dismantle.start_time}–${reservation.dismantle.end_time}`);
  }

  return {
    reservationId: reservation.id,
    roomName: reservation.room_name || "Salle",
    start: toIcsLocalDateTime(start.date, start.time, "00:00"),
    end: toIcsLocalDateTime(end.date, end.time, "23:59"),
    description: lines.join("\\n")
  };
}

// Escapes the characters RFC 5545 requires escaping in TEXT values (comma, semicolon, backslash,
// newline already turned into literal "\n" by callers).
function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

// RFC 5545 recommends folding lines over 75 octets; Outlook tolerates long lines in practice, but
// folding is cheap and keeps this a well-formed .ics for any reader.
function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  let result = line.slice(0, 75);
  let rest = line.slice(75);
  while (rest.length > 0) {
    result += "\r\n " + rest.slice(0, 74);
    rest = rest.slice(74);
  }
  return result;
}

function nowAsIcsUtcStamp(): string {
  const now = new Date();
  return (
    `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}T` +
    `${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`
  );
}

// Builds one VCALENDAR with one VEVENT per technical-director reservation. Returns "" if the
// activity has none (callers should already have checked activityHasTechnicalDirector).
function buildTechnicalDirectorIcs(act: any): string {
  const windows = getTechnicalDirectorReservations(act)
    .map(buildReservationWindow)
    .filter((w): w is TechnicalDirectorWindow => w !== null);
  if (windows.length === 0) return "";

  const stamp = nowAsIcsUtcStamp();
  const activityName = act.name?.trim() || "Activité";

  const events = windows.map(w => {
    const lines = [
      "BEGIN:VEVENT",
      `UID:${act.id}-${w.reservationId}-dt@outil-marie`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${w.start}`,
      `DTEND:${w.end}`,
      `SUMMARY:${escapeIcsText(`DT — ${activityName} (${w.roomName})`)}`,
      `LOCATION:${escapeIcsText(w.roomName)}`,
      `DESCRIPTION:${escapeIcsText(w.description)}`,
      "END:VEVENT"
    ];
    return lines.map(foldIcsLine).join("\r\n");
  });

  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Outil Marie//Activites//FR", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR"].join(
    "\r\n"
  );
}

// Matches Unicode combining diacritical marks (U+0300-U+036F) left behind by normalize("NFD").
const DIACRITICS_PATTERN = /[̀-ͯ]/g;

function icsFileNameFor(act: any): string {
  const slug =
    (act.name || "activite")
      .normalize("NFD")
      .replace(DIACRITICS_PATTERN, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "activite";
  return `directeur-technique-${slug}.ics`;
}

function downloadIcsFile(icsText: string, fileName: string): void {
  const blob = new Blob([icsText], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildMailtoUrl(subject: string, body: string): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// Orchestrates the whole "Envoyer au directeur technique" action: builds the .ics, tries to hand
// it directly to a share target (Outlook on supporting Edge/Windows setups) via the Web Share API,
// and otherwise falls back to a download + prefilled mailto: draft.
async function sendActivityScheduleToTechnicalDirector(act: any): Promise<void> {
  const windows = getTechnicalDirectorReservations(act)
    .map(buildReservationWindow)
    .filter((w): w is TechnicalDirectorWindow => w !== null);
  if (windows.length === 0) {
    showToast("Aucune plage horaire valide à envoyer (dates de réservation manquantes).", "warning");
    return;
  }

  const icsText = buildTechnicalDirectorIcs(act);
  const fileName = icsFileNameFor(act);
  const activityName = act.name?.trim() || "Activité";
  const subject = `Plage horaire à réserver — ${activityName}`;
  const roomList = windows.map(w => `- ${w.roomName} : ${w.description.replace(/\\n/g, "\n  ")}`).join("\n");

  const shareFile = new File([icsText], fileName, { type: "text/calendar" });
  const canShareFiles = typeof navigator.canShare === "function" && navigator.canShare({ files: [shareFile] });
  if (canShareFiles && navigator.share) {
    try {
      await navigator.share({ files: [shareFile], title: subject, text: `Plage horaire à réserver pour :\n${roomList}` });
      showToast("La demande a été transmise à votre application de partage.", "success");
      return;
    } catch (e: any) {
      if (e?.name === "AbortError") return; // user cancelled the share sheet — not an error
      // Any other failure (e.g. no matching share target installed) falls through to the
      // download + mailto fallback below.
    }
  }

  downloadIcsFile(icsText, fileName);
  const body =
    `Bonjour,\n\nVoici la plage horaire à réserver pour l'activité « ${activityName} » :\n\n${roomList}\n\n` +
    `Le fichier ${fileName} vient d'être téléchargé — veuillez le joindre à ce courriel avant de l'envoyer.\n`;
  window.location.href = buildMailtoUrl(subject, body);
  showToast(`Fichier ${fileName} téléchargé — joignez-le au courriel qui vient de s'ouvrir.`, "info");
}

export {
  TECHNICAL_DIRECTOR_SALARY_ID,
  activityHasTechnicalDirector,
  getTechnicalDirectorReservations,
  buildReservationWindow,
  buildTechnicalDirectorIcs,
  icsFileNameFor,
  sendActivityScheduleToTechnicalDirector
};
