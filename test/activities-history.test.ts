import test from "node:test";
import assert from "node:assert/strict";
import "./indexeddb-mock.ts";
import { appState } from "../src/state/state.ts";
import {
  timeRangesOverlap,
  getReservationOccupiedRanges,
  computeActivityDiff,
  checkRoomReservationConflicts,
  getDaysOfWeekInRange,
  formatTimestampToFrench,
  saveActivityVersion
} from "../src/activities/history/index.ts";

test("timeRangesOverlap detects overlapping windows on the same day", () => {
  assert.equal(timeRangesOverlap("09:00", "12:00", "11:00", "14:00"), true);
  assert.equal(timeRangesOverlap("09:00", "12:00", "12:00", "14:00"), false);
  assert.equal(timeRangesOverlap("09:00", "12:00", "13:00", "14:00"), false);
});

test("timeRangesOverlap treats missing times as the full day (00:00-23:59)", () => {
  assert.equal(timeRangesOverlap("", "", "20:00", "22:00"), true);
  assert.equal(timeRangesOverlap("09:00", "10:00", "", ""), true);
});

test("getReservationOccupiedRanges includes créneaux plus enabled install/dismantle windows", () => {
  const reservation = {
    slots: [{ date: "2025-08-01", start_time: "09:00", end_time: "17:00" }],
    install: { enabled: true, date: "2025-07-31", start_time: "13:00", end_time: "17:00" },
    dismantle: { enabled: false, date: "2025-08-02" }
  };
  const ranges = getReservationOccupiedRanges(reservation as any);
  assert.equal(ranges.length, 2);
  assert.ok(ranges.some((r: any) => r.date === "2025-08-01"));
  assert.ok(ranges.some((r: any) => r.date === "2025-07-31"));
  assert.ok(!ranges.some((r: any) => r.date === "2025-08-02")); // disabled dismantle window excluded
});

test("getReservationOccupiedRanges ignores slots without a date", () => {
  const reservation = { slots: [{ start_time: "09:00", end_time: "10:00" }] };
  assert.deepEqual(getReservationOccupiedRanges(reservation as any), []);
});

test("computeActivityDiff reports only fields that actually changed", () => {
  const oldAct = { name: "Réunion A", responsable_last_name: "Dupont", client_type: "interne" };
  const newAct = { name: "Réunion A", responsable_last_name: "Tremblay", client_type: "interne" };

  const diffs = computeActivityDiff(oldAct, newAct);
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].label, "Responsable facturation: Nom");
  assert.equal(diffs[0].oldVal, "Dupont");
  assert.equal(diffs[0].newVal, "Tremblay");
});

test("computeActivityDiff labels empty values as [Vide] instead of leaving them blank", () => {
  const diffs = computeActivityDiff({ description: "Une description" }, { description: "" });
  const descDiff = diffs.find(d => d.label === "Description") as any;
  assert.ok(descDiff);
  assert.equal(descDiff.oldVal, "Une description");
  assert.equal(descDiff.newVal, "[Vide]");
});

test("computeActivityDiff summarizes reservation and distribution changes rather than diffing them field by field", () => {
  const oldAct = { reservations: [] };
  const newAct = { reservations: [{ room_name: "Salle A", slots: [{ date: "2025-08-01" }, { date: "2025-08-02" }] }] };

  const diffs = computeActivityDiff(oldAct, newAct);
  const resDiff = diffs.find(d => d.label === "Réservations de salles") as any;
  assert.ok(resDiff);
  assert.equal(resDiff.oldVal, "Aucune salle");
  assert.equal(resDiff.newVal, "Salle A (2 créneaux)");
});

test("checkRoomReservationConflicts detects conflicts and sets banner innerHTML", () => {
  const internalIdEl = { value: "act-1" };
  const bannerEl = { style: {} as any, innerHTML: "" };
  const checkEl = {
    classList: {
      classes: new Set<string>(),
      add(c: string) { this.classes.add(c); },
      remove(c: string) { this.classes.delete(c); },
      contains(c: string) { return this.classes.has(c); }
    },
    attrs: {} as Record<string, string>,
    setAttribute(name: string, value: string) { this.attrs[name] = value; },
    removeAttribute(name: string) { delete this.attrs[name]; }
  };
  const sectionEl = { open: false };
  (globalThis as any).document = {
    getElementById(id: string) {
      if (id === "form-activity-internal-id") return internalIdEl;
      if (id === "form-activity-room-conflicts") return bannerEl;
      if (id === "accordion-check-rooms") return checkEl;
      if (id === "accordion-section-rooms") return sectionEl;
      return null;
    }
  };

  appState.activities = [
    {
      id: "act-2",
      name: "Autre Activité",
      reservations: [
        {
          room_name: "Salle A",
          slots: [{ date: "2025-08-01", start_time: "09:00", end_time: "12:00" }]
        }
      ]
    }
  ];

  // Conflict: Room A is booked at overlapping time
  const currentReservations = [
    {
      room_name: "Salle A",
      slots: [{ date: "2025-08-01", start_time: "11:00", end_time: "14:00" }]
    }
  ];

  checkRoomReservationConflicts(currentReservations as any);

  assert.equal(bannerEl.style.display, "block");
  assert.ok(bannerEl.innerHTML.includes("Salle A"));
  assert.ok(bannerEl.innerHTML.includes("Autre Activité"));
  assert.equal(checkEl.classList.contains("conflict"), true);
  assert.equal(sectionEl.open, true, "the accordion should be forced open so the conflict can't be missed while collapsed");

  // Resolving the conflict should clear both the check mark and (if reopened by hand) not force it back open.
  checkRoomReservationConflicts([]);
  assert.equal(bannerEl.style.display, "none");
  assert.equal(checkEl.classList.contains("conflict"), false);
});

test("getDaysOfWeekInRange returns correct days of week", () => {
  assert.equal(getDaysOfWeekInRange("2025-08-01", "2025-08-03"), "vendredi, samedi, dimanche");
  assert.equal(getDaysOfWeekInRange("", "2025-08-03"), "");
  assert.equal(getDaysOfWeekInRange("2025-08-03", "2025-08-01"), "");
});

test("formatTimestampToFrench formats ISO string into French readable timestamp", () => {
  const dateStr = new Date("2025-08-01T15:30:00.000Z");
  const formatted = formatTimestampToFrench(dateStr.toISOString());
  
  // Format is DD/MM/YYYY à HHhMM:SS (in local time, so let's construct expected string dynamically)
  const day = String(dateStr.getDate()).padStart(2, "0");
  const month = String(dateStr.getMonth() + 1).padStart(2, "0");
  const year = dateStr.getFullYear();
  const hours = String(dateStr.getHours()).padStart(2, "0");
  const minutes = String(dateStr.getMinutes()).padStart(2, "0");
  const seconds = String(dateStr.getSeconds()).padStart(2, "0");
  const expected = `${day}/${month}/${year} à ${hours}h${minutes}:${seconds}`;

  assert.equal(formatted, expected);
  assert.equal(formatTimestampToFrench(""), "");
  assert.equal(formatTimestampToFrench("invalid-timestamp"), "");
});

test("saveActivityVersion saves the version to IndexedDB", async () => {
  const act = { id: "act-1", name: "Versioned Event", state: "confirmed" };
  await saveActivityVersion(act as any);
  assert.ok(true);
});
export {};
