import test from "node:test";
import assert from "node:assert/strict";
import { dom } from "../dom-mock.ts";

test.after(() => dom.window.close());

(globalThis as any).localStorage = {
  store: {} as Record<string, string>,
  getItem(key: string) { return this.store[key] || null; },
  setItem(key: string, value: string) { this.store[key] = String(value); },
  removeItem(key: string) { delete this.store[key]; },
  clear() { this.store = {}; }
};

import { setAppState } from "../../src/state/state.ts";
import { addReservationCard } from "../../src/activities/reservations/index.ts";

function baseState(overrides: any = {}) {
  return {
    settings: {
      theme: "dark",
      rooms: [],
      departments: [],
      accounts: [],
      last_backup_date: "",
      backup_reminder_days: 7,
      salaries: [],
      services: [],
      global_tasks: [],
      schedulable_tasks: []
    },
    activities: [],
    favorites: [],
    selected_year: "2025-2026",
    selected_quarters: [1, 2, 3, 4],
    ...overrides
  };
}

function click(el: Element) {
  el.dispatchEvent(new (globalThis as any).Event("click", { bubbles: true }));
}

test.beforeEach(() => {
  setAppState(baseState());
  document.body.innerHTML = `
    <div id="form-activity-reservations"></div>
    <div id="submission-financial-summary"></div>
    <div id="form-distribution-total-val"></div>
    <input id="form-activity-internal-id" value="">
    <div id="toast-container"></div>
  `;
});

function buildCard() {
  const container = document.getElementById("form-activity-reservations")!;
  addReservationCard();
  return container.querySelector(".reservation-card") as HTMLElement;
}

test("generates one slot per day of the range when every weekday pill is active (the default)", () => {
  const card = buildCard();
  card.querySelector<HTMLInputElement>(".slot-range-start-date")!.value = "2025-08-04"; // Monday
  card.querySelector<HTMLInputElement>(".slot-range-end-date")!.value = "2025-08-08"; // Friday
  card.querySelector<HTMLInputElement>(".slot-range-start-time")!.value = "09:00";
  card.querySelector<HTMLInputElement>(".slot-range-end-time")!.value = "17:00";

  click(card.querySelector(".slot-range-generate-btn")!);

  const slotDates = Array.from(card.querySelectorAll<HTMLInputElement>(".slot-date-input")).map(i => i.value);
  assert.deepEqual(slotDates, ["2025-08-04", "2025-08-05", "2025-08-06", "2025-08-07", "2025-08-08"]);
  const firstSlot = card.querySelector(".reservation-slot-row") as HTMLElement;
  assert.equal(firstSlot.querySelector<HTMLInputElement>(".slot-start-time-input")!.value, "09:00");
  assert.equal(firstSlot.querySelector<HTMLInputElement>(".slot-end-time-input")!.value, "17:00");
});

test("skips days whose weekday pill was deactivated", () => {
  const card = buildCard();
  // Deactivate weekends (Sam/Dim) by clicking their pills off
  const weekdaysGroup = card.querySelector(".slot-range-weekdays-group")!;
  const satBtn = weekdaysGroup.querySelector('.pill-toggle[data-value="6"]') as HTMLElement;
  const sunBtn = weekdaysGroup.querySelector('.pill-toggle[data-value="0"]') as HTMLElement;
  click(satBtn);
  click(sunBtn);

  card.querySelector<HTMLInputElement>(".slot-range-start-date")!.value = "2025-08-04"; // Monday
  card.querySelector<HTMLInputElement>(".slot-range-end-date")!.value = "2025-08-10"; // Sunday
  click(card.querySelector(".slot-range-generate-btn")!);

  const slotDates = Array.from(card.querySelectorAll<HTMLInputElement>(".slot-date-input")).map(i => i.value);
  assert.deepEqual(slotDates, ["2025-08-04", "2025-08-05", "2025-08-06", "2025-08-07", "2025-08-08"]);
});

test("rejects an invalid or incomplete date range with a toast and adds no slots", () => {
  const card = buildCard();
  card.querySelector<HTMLInputElement>(".slot-range-start-date")!.value = "2025-08-04";
  card.querySelector<HTMLInputElement>(".slot-range-end-date")!.value = ""; // missing end date

  click(card.querySelector(".slot-range-generate-btn")!);

  assert.equal(card.querySelectorAll(".reservation-slot-row").length, 0);
  const toast = document.querySelector(".toast-message");
  assert.match(toast!.textContent!, /date de début et une date de fin valides/);
});

test("rejects a range where the start date is after the end date, without adding slots", () => {
  const card = buildCard();
  card.querySelector<HTMLInputElement>(".slot-range-start-date")!.value = "2025-08-10";
  card.querySelector<HTMLInputElement>(".slot-range-end-date")!.value = "2025-08-04";

  click(card.querySelector(".slot-range-generate-btn")!);

  assert.equal(card.querySelectorAll(".reservation-slot-row").length, 0);
  const toast = document.querySelector(".toast-message");
  assert.match(toast!.textContent!, /antérieure ou égale/);
});

test("the generate button hides the range generator panel again and a single-day range produces exactly one slot", () => {
  const card = buildCard();
  const generatorEl = card.querySelector<HTMLElement>(".reservation-slot-range-generator")!;
  // Open the panel through the real toggle button (its visibility is React state now —
  // SlotsFields.tsx's generatorOpen — not a class/style the test can force directly).
  click(card.querySelector(".reservation-add-slot-range-btn")!);
  assert.equal(generatorEl.style.display, "block");

  card.querySelector<HTMLInputElement>(".slot-range-start-date")!.value = "2025-08-04";
  card.querySelector<HTMLInputElement>(".slot-range-end-date")!.value = "2025-08-04";
  click(card.querySelector(".slot-range-generate-btn")!);

  assert.equal(card.querySelectorAll(".reservation-slot-row").length, 1);
  assert.equal(generatorEl.style.display, "none");
});

export {};
