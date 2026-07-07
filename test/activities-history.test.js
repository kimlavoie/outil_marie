import test from "node:test";
import assert from "node:assert/strict";
import { timeRangesOverlap, getReservationOccupiedRanges, computeActivityDiff } from "../js/activities-history.ts";

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
  const ranges = getReservationOccupiedRanges(reservation);
  assert.equal(ranges.length, 2);
  assert.ok(ranges.some(r => r.date === "2025-08-01"));
  assert.ok(ranges.some(r => r.date === "2025-07-31"));
  assert.ok(!ranges.some(r => r.date === "2025-08-02")); // disabled dismantle window excluded
});

test("getReservationOccupiedRanges ignores slots without a date", () => {
  const reservation = { slots: [{ start_time: "09:00", end_time: "10:00" }] };
  assert.deepEqual(getReservationOccupiedRanges(reservation), []);
});

test("computeActivityDiff reports only fields that actually changed", () => {
  const oldAct = { name: "Réunion A", responsable: "M. Dupont", client_type: "interne" };
  const newAct = { name: "Réunion A", responsable: "Mme Tremblay", client_type: "interne" };

  const diffs = computeActivityDiff(oldAct, newAct);
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].label, "Responsable facturation");
  assert.equal(diffs[0].oldVal, "M. Dupont");
  assert.equal(diffs[0].newVal, "Mme Tremblay");
});

test("computeActivityDiff labels empty values as [Vide] instead of leaving them blank", () => {
  const diffs = computeActivityDiff({ description: "Une description" }, { description: "" });
  const descDiff = diffs.find(d => d.label === "Description");
  assert.equal(descDiff.oldVal, "Une description");
  assert.equal(descDiff.newVal, "[Vide]");
});

test("computeActivityDiff summarizes reservation and distribution changes rather than diffing them field by field", () => {
  const oldAct = { reservations: [] };
  const newAct = { reservations: [{ room_name: "Salle A", slots: [{ date: "2025-08-01" }, { date: "2025-08-02" }] }] };

  const diffs = computeActivityDiff(oldAct, newAct);
  const resDiff = diffs.find(d => d.label === "Réservations de salles");
  assert.equal(resDiff.oldVal, "Aucune salle");
  assert.equal(resDiff.newVal, "Salle A (2 créneaux)");
});
