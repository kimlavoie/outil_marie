import test from "node:test";
import assert from "node:assert/strict";
import { dom } from "./dom-mock.ts";

test.after(() => dom.window.close());

(globalThis as any).localStorage = {
  store: {} as Record<string, string>,
  getItem(key: string) { return this.store[key] || null; },
  setItem(key: string, value: string) { this.store[key] = String(value); },
  removeItem(key: string) { delete this.store[key]; },
  clear() { this.store = {}; }
};

import { setAppState } from "../src/state/state.ts";
import { addSlotRow, collectSlotsFromCard, addNextSlotRow } from "../src/activities/reservations.ts";

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

function freshContainer() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

test.beforeEach(() => {
  setAppState(baseState());
  document.body.innerHTML = "";
});

test("addSlotRow creates a row pre-filled with the given date/start/end time", () => {
  const container = freshContainer();
  addSlotRow(container, "2025-08-01", "09:00", "17:00");

  const row = container.querySelector(".reservation-slot-row") as HTMLElement;
  assert.equal(row.querySelector<HTMLInputElement>(".slot-date-input")!.value, "2025-08-01");
  assert.equal(row.querySelector<HTMLInputElement>(".slot-start-time-input")!.value, "09:00");
  assert.equal(row.querySelector<HTMLInputElement>(".slot-end-time-input")!.value, "17:00");
});

test("addSlotRow validates the fiscal year of a pre-filled date immediately, flagging one that's out of range", () => {
  const container = freshContainer();
  addSlotRow(container, "2024-01-01"); // outside 2025-2026

  const row = container.querySelector(".reservation-slot-row") as HTMLElement;
  const dateInput = row.querySelector<HTMLInputElement>(".slot-date-input")!;
  assert.equal(dateInput.classList.contains("invalid"), true);
  const errorEl = row.querySelector(".field-error-msg")!;
  assert.match(errorEl.textContent!, /année financière active/);
});

test("addSlotRow's delete button removes the row from the DOM", () => {
  // Stubs the fields the delete handler's downstream autoSaveActivityForm() reads: an empty
  // internal id makes it return immediately instead of needing the whole activity form present.
  document.body.innerHTML += `<input id="form-activity-internal-id" value="">`;

  const container = freshContainer();
  addSlotRow(container, "2025-08-01");
  assert.equal(container.querySelectorAll(".reservation-slot-row").length, 1);

  (container.querySelector(".delete-slot-row-btn") as HTMLElement).dispatchEvent(new (globalThis as any).Event("click", { bubbles: true }));
  assert.equal(container.querySelectorAll(".reservation-slot-row").length, 0);
});

test("collectSlotsFromCard reads date/start/end time from every slot row under .reservation-slots-list", () => {
  const card = freshContainer();
  card.innerHTML = `<div class="reservation-slots-list"></div>`;
  const slotsList = card.querySelector(".reservation-slots-list") as HTMLElement;
  addSlotRow(slotsList, "2025-08-01", "09:00", "12:00");
  addSlotRow(slotsList, "2025-08-02", "13:00", "17:00");

  const slots = collectSlotsFromCard(card);
  assert.equal(slots.length, 2);
  assert.equal(slots[0].date, "2025-08-01");
  assert.equal(slots[0].start_time, "09:00");
  assert.equal(slots[0].end_time, "12:00");
  assert.equal(slots[1].date, "2025-08-02");
});

test("collectSlotsFromCard drops rows with no date entered", () => {
  const card = freshContainer();
  card.innerHTML = `<div class="reservation-slots-list"></div>`;
  const slotsList = card.querySelector(".reservation-slots-list") as HTMLElement;
  addSlotRow(slotsList, "2025-08-01");
  addSlotRow(slotsList, ""); // blank date: dropped

  const slots = collectSlotsFromCard(card);
  assert.equal(slots.length, 1);
  assert.equal(slots[0].date, "2025-08-01");
});

test("addNextSlotRow adds a blank row when the container has none yet", () => {
  const container = freshContainer();
  addNextSlotRow(container);
  assert.equal(container.querySelectorAll(".reservation-slot-row").length, 1);
  assert.equal(container.querySelector<HTMLInputElement>(".slot-date-input")!.value, "");
});

test("addNextSlotRow carries the previous row's start/end time and advances the date by one day", () => {
  const container = freshContainer();
  addSlotRow(container, "2025-08-01", "09:00", "17:00");
  addNextSlotRow(container);

  const rows = container.querySelectorAll(".reservation-slot-row");
  assert.equal(rows.length, 2);
  const secondRow = rows[1] as HTMLElement;
  assert.equal(secondRow.querySelector<HTMLInputElement>(".slot-date-input")!.value, "2025-08-02");
  assert.equal(secondRow.querySelector<HTMLInputElement>(".slot-start-time-input")!.value, "09:00");
  assert.equal(secondRow.querySelector<HTMLInputElement>(".slot-end-time-input")!.value, "17:00");
});

test("addNextSlotRow leaves the date blank when the previous row had no date", () => {
  const container = freshContainer();
  addSlotRow(container, "", "09:00", "17:00");
  addNextSlotRow(container);

  const rows = container.querySelectorAll(".reservation-slot-row");
  const secondRow = rows[1] as HTMLElement;
  assert.equal(secondRow.querySelector<HTMLInputElement>(".slot-date-input")!.value, "");
});

export {};
