import test from "node:test";
import assert from "node:assert/strict";
import { calculateDaysCount, getRoomsTariffTotal, getActivityReferences } from "../js/utils.js";

test("calculateDaysCount counts both endpoints inclusively", () => {
  assert.equal(calculateDaysCount("2025-01-01", "2025-01-05"), 5);
  assert.equal(calculateDaysCount("2025-01-01", "2025-01-01"), 1);
});

test("calculateDaysCount falls back to 1 day for missing or invalid input", () => {
  assert.equal(calculateDaysCount("", "2025-01-05"), 1);
  assert.equal(calculateDaysCount("2025-01-05", ""), 1);
  assert.equal(calculateDaysCount("not-a-date", "2025-01-05"), 1);
});

test("calculateDaysCount falls back to 1 day when the end precedes the start", () => {
  assert.equal(calculateDaysCount("2025-01-05", "2025-01-01"), 1);
});

test("getRoomsTariffTotal sums tariff_amount x number of créneaux across every réservation", () => {
  const activity = {
    reservations: [
      { slots: [{ date: "2025-01-01" }, { date: "2025-01-02" }], tariff_amount: 100 }, // 2 slots x 100 = 200
      { slots: [{ date: "2025-02-01" }, { date: "2025-02-02" }, { date: "2025-02-03" }], tariff_amount: 50 } // 3 slots x 50 = 150
    ]
  };
  assert.equal(getRoomsTariffTotal(activity), 350);
});

test("getRoomsTariffTotal returns 0 when the activity has no reservations", () => {
  assert.equal(getRoomsTariffTotal({}), 0);
  assert.equal(getRoomsTariffTotal({ reservations: [] }), 0);
});

test("getActivityReferences joins distinct, non-empty references", () => {
  const activity = {
    distributions: [{ reference: "RI001" }, { reference: "RI001" }, { reference: "RI002" }, { reference: "" }]
  };
  assert.equal(getActivityReferences(activity), "RI001, RI002");
});
