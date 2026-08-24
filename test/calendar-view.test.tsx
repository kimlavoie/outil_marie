import test from "node:test";
import assert from "node:assert/strict";
import { dom } from "./dom-mock.ts";
import "./indexeddb-mock.ts";

test.after(() => dom.window.close());

(globalThis as any).localStorage = {
  store: {} as Record<string, string>,
  getItem(key: string) { return this.store[key] || null; },
  setItem(key: string, value: string) { this.store[key] = String(value); },
  removeItem(key: string) { delete this.store[key]; },
  clear() { this.store = {}; }
};

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { render, cleanup, act, fireEvent } from "@testing-library/react";
import { setAppState } from "../src/state/state.ts";
import {
  CalendarModal,
  useCalendarCommand,
  openCalendarModal,
  openCalendarAtDate,
  reopenCalendarModal
} from "../src/components/calendar-view.tsx";

// <CalendarModal> now reads its command via useCalendarCommand() (a plain useSyncExternalStore
// store, same pattern as settings/mount.ts) instead of owning its own createRoot() — App.tsx
// renders it directly. Mirror that here with a small harness component rendered through
// @testing-library/react, same pattern as the activity-drawer tests.
function Harness() {
  const command = useCalendarCommand();
  return <CalendarModal command={command} />;
}

const YEAR = "2025-2026";
const ALL_QUARTERS = [1, 2, 3, 4];

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
    selected_year: YEAR,
    selected_quarters: ALL_QUARTERS,
    ...overrides
  };
}

function activity(overrides: any = {}) {
  return {
    id: "act-1",
    name: "Activité test",
    date_start: "2025-08-15",
    date_end: "2025-08-15",
    client_type: "externe",
    reservations: [],
    deleted: false,
    ...overrides
  };
}

test.beforeEach(() => {
  setAppState(baseState());
  document.body.innerHTML = "";
  const backdrop = document.createElement("div");
  backdrop.id = "modal-backdrop";
  document.body.appendChild(backdrop);
  render(<Harness />);
});

test.afterEach(() => cleanup());

test("openCalendarModal opens the modal in month view showing the current month", () => {
  const now = new Date();
  act(() => openCalendarModal());

  const modal = document.getElementById("calendar-modal")!;
  assert.equal(modal.classList.contains("active"), true);
  const label = modal.querySelector(".event-calendar-month-label")!.textContent;
  assert.match(label!, new RegExp(String(now.getFullYear())));
  assert.ok(modal.querySelector(".event-calendar-grid-month"));
});

test("shows a single-day activity on its day cell in month view", () => {
  setAppState(baseState({ activities: [activity({ date_start: "2025-08-15", date_end: "2025-08-15" })] }));
  act(() => openCalendarAtDate("2025-08-01")); // opens in day view; navigate isn't needed since we read via date attr

  const modal = document.getElementById("calendar-modal")!;
  // Switch to month view to see the grid cell for the 15th
  fireEvent.click([...modal.querySelectorAll(".event-calendar-view-btn")].find(b => b.textContent === "Mois")!);

  const cell = modal.querySelector('.event-calendar-cell[data-date="2025-08-15"]')!;
  assert.match(cell.textContent!, /Activité test/);
});

test("shows a multi-day activity on every day within its date range", () => {
  setAppState(baseState({ activities: [activity({ date_start: "2025-08-10", date_end: "2025-08-12" })] }));
  act(() => openCalendarAtDate("2025-08-01"));
  const modal = document.getElementById("calendar-modal")!;
  fireEvent.click([...modal.querySelectorAll(".event-calendar-view-btn")].find(b => b.textContent === "Mois")!);

  for (const day of ["2025-08-10", "2025-08-11", "2025-08-12"]) {
    const cell = modal.querySelector(`.event-calendar-cell[data-date="${day}"]`)!;
    assert.match(cell.textContent!, /Activité test/, `expected activity to show on ${day}`);
  }
  const dayBefore = modal.querySelector('.event-calendar-cell[data-date="2025-08-09"]')!;
  assert.doesNotMatch(dayBefore.textContent!, /Activité test/);
});

test("shows a '+N de plus' overflow indicator once a day has more than 3 activities", () => {
  setAppState(
    baseState({
      activities: [1, 2, 3, 4, 5].map(n => activity({ id: `act-${n}`, name: `Activité ${n}`, date_start: "2025-08-20", date_end: "2025-08-20" }))
    })
  );
  act(() => openCalendarAtDate("2025-08-01"));
  const modal = document.getElementById("calendar-modal")!;
  fireEvent.click([...modal.querySelectorAll(".event-calendar-view-btn")].find(b => b.textContent === "Mois")!);

  const cell = modal.querySelector('.event-calendar-cell[data-date="2025-08-20"]')!;
  assert.equal(cell.querySelectorAll(".event-calendar-event").length, 3);
  assert.match(cell.querySelector(".event-calendar-more")!.textContent!, /\+2 de plus/);
});

test("navigating to the next/previous month updates the displayed month label", () => {
  act(() => openCalendarAtDate("2025-08-01"));
  const modal = document.getElementById("calendar-modal")!;
  fireEvent.click([...modal.querySelectorAll(".event-calendar-view-btn")].find(b => b.textContent === "Mois")!);
  assert.match(modal.querySelector(".event-calendar-month-label")!.textContent!, /Août 2025/);

  fireEvent.click(modal.querySelector(".calendar-nav-btn")!); // "<" is the first nav button (prev)
  assert.match(modal.querySelector(".event-calendar-month-label")!.textContent!, /Juillet 2025/);

  const nextBtn = modal.querySelectorAll(".calendar-nav-btn")[1];
  fireEvent.click(nextBtn);
  assert.match(modal.querySelector(".event-calendar-month-label")!.textContent!, /Août 2025/);

  fireEvent.click(nextBtn);
  assert.match(modal.querySelector(".event-calendar-month-label")!.textContent!, /Septembre 2025/);
});

test("openCalendarAtDate opens directly in day view for the given date", () => {
  setAppState(baseState({ activities: [activity({ date_start: "2025-08-15", date_end: "2025-08-15" })] }));
  act(() => openCalendarAtDate("2025-08-15"));

  const modal = document.getElementById("calendar-modal")!;
  assert.ok(modal.querySelector(".event-calendar-grid-day"));
  assert.match(modal.querySelector(".event-calendar-month-label")!.textContent!, /15 août 2025/i);
  assert.match(modal.textContent!, /Activité test/);
});

test("day view shows the empty-state message when nothing is scheduled that day", () => {
  act(() => openCalendarAtDate("2025-08-16"));
  const modal = document.getElementById("calendar-modal")!;
  assert.match(modal.querySelector(".event-calendar-day-empty")!.textContent!, /Aucune activité prévue cette journée\./);
});

test("day view lists the room/time/responsable meta for each activity", () => {
  setAppState(
    baseState({
      activities: [
        activity({
          date_start: "2025-08-15",
          date_end: "2025-08-15",
          responsable: "Jean Tremblay",
          start_time: "09:00",
          end_time: "12:00",
          reservations: [{ room_name: "Salle A" }]
        })
      ]
    })
  );
  act(() => openCalendarAtDate("2025-08-15"));
  const modal = document.getElementById("calendar-modal")!;
  const meta = modal.querySelector(".event-calendar-day-item-meta")!.textContent!;
  assert.match(meta, /Salle A/);
  assert.match(meta, /09:00 - 12:00/);
  assert.match(meta, /Jean Tremblay/);
});

test("clicking a day cell (not an event) navigates to day view for that date", () => {
  act(() => openCalendarAtDate("2025-08-01"));
  const modal = document.getElementById("calendar-modal")!;
  fireEvent.click([...modal.querySelectorAll(".event-calendar-view-btn")].find(b => b.textContent === "Mois")!);

  fireEvent.click(modal.querySelector('.event-calendar-cell[data-date="2025-08-22"]')!);

  assert.ok(modal.querySelector(".event-calendar-grid-day"));
  assert.match(modal.querySelector(".event-calendar-month-label")!.textContent!, /22 août 2025/i);
});

test("renders one legend dot/swatch per configured room", () => {
  setAppState(baseState({ settings: { ...baseState().settings, rooms: [{ name: "Salle A" }, { name: "Salle B" }] } }));
  act(() => openCalendarModal());
  const modal = document.getElementById("calendar-modal")!;

  assert.equal(modal.querySelectorAll(".room-color-dot").length, 2);
  assert.equal(modal.querySelectorAll(".room-color-swatch").length, 2);
  assert.match(modal.querySelector(".event-calendar-legend")!.textContent!, /Salle A/);
  assert.match(modal.querySelector(".event-calendar-legend")!.textContent!, /Salle B/);
});

test("hovering an event shows the preview with its details, and unhovering clears it", () => {
  setAppState(
    baseState({
      activities: [
        activity({
          date_start: "2025-08-15",
          date_end: "2025-08-16",
          responsable: "Jean Tremblay",
          department: "Arts",
          client_type: "interne",
          reservations: [{ room_name: "Salle A" }]
        })
      ]
    })
  );
  act(() => openCalendarAtDate("2025-08-01"));
  const modal = document.getElementById("calendar-modal")!;
  fireEvent.click([...modal.querySelectorAll(".event-calendar-view-btn")].find(b => b.textContent === "Mois")!);

  const eventEl = modal.querySelector('.event-calendar-cell[data-date="2025-08-15"] .event-calendar-event')!;
  fireEvent.mouseEnter(eventEl);

  const preview = document.getElementById("event-calendar-hover-preview")!;
  assert.equal(preview.classList.contains("active"), true);
  assert.match(preview.textContent!, /Salle A/);
  assert.match(preview.textContent!, /2025-08-15 → 2025-08-16/);
  assert.match(preview.textContent!, /Jean Tremblay/);
  assert.match(preview.textContent!, /Arts/);
  assert.match(preview.textContent!, /Interne/);

  fireEvent.mouseLeave(eventEl);
  assert.equal(document.getElementById("event-calendar-hover-preview")!.classList.contains("active"), false);
});

test("the close button hides the modal", () => {
  act(() => openCalendarModal());
  const modal = document.getElementById("calendar-modal")!;
  assert.equal(modal.classList.contains("active"), true);

  fireEvent.click(modal.querySelector('.modal-header button[aria-label="Fermer"]')!);

  assert.equal(modal.classList.contains("active"), false);
});

test("clicking the shared modal backdrop also closes the modal", () => {
  act(() => openCalendarModal());
  const modal = document.getElementById("calendar-modal")!;
  assert.equal(modal.classList.contains("active"), true);
  assert.equal(document.getElementById("modal-backdrop")!.classList.contains("active"), true);

  fireEvent.click(document.getElementById("modal-backdrop")!);

  assert.equal(modal.classList.contains("active"), false);
});

test("reopenCalendarModal reopens at the given past view/date", () => {
  // Mirrors the real caller (CalendarModal's openEvent): a live Date object, not an ISO string —
  // parsing "2025-03-10" as a string would go through UTC midnight and could shift a day
  // depending on the host timezone.
  act(() => reopenCalendarModal({ refDate: new Date(2025, 2, 10), viewMode: "day" }));
  const modal = document.getElementById("calendar-modal")!;
  assert.equal(modal.classList.contains("active"), true);
  assert.ok(modal.querySelector(".event-calendar-grid-day"));
  assert.match(modal.querySelector(".event-calendar-month-label")!.textContent!, /10 mars 2025/i);
});

export {};
