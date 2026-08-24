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

import { act } from "react";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { setAppState, appState } from "../src/state/state.ts";
import { activitiesState } from "../src/activities/render.ts";
import { fillActivityFormFields } from "../src/activities/form.ts";
import { collectReservationsFromForm } from "../src/activities/reservations/index.ts";
import { ActivityDrawer, triggerOpenActivityDrawer } from "../src/components/activities/ActivityDrawer.tsx";

// Covers créneaux row add/remove through the real drawer ("sous-tranche C") — the standalone
// addReservationCard()-level generator behavior is covered by test/reservations/slot-range.test.ts.

function flush(ms = 150): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function baseActivity(overrides: any = {}) {
  return {
    id: "act-test-1",
    mode: "soumission",
    state: "brouillon",
    coba: "",
    name: "Activité test",
    attendees_count: 0,
    description: "",
    responsable_first_name: "",
    responsable_last_name: "",
    client_type: "interne",
    responsable_same_as_manager: false,
    activity_manager: { first_name: "", last_name: "", type: "employe" },
    reservations: [],
    department: "",
    distributions: [],
    date_start: "",
    date_end: "",
    submission: { file_link_id: "", generated_at: "", sent_at: "" },
    contract: { file_link_id: "", approved_at: "" },
    form: { file_link_id: "", linked_at: "" },
    supporting_docs: { folder_link_id: "", linked_at: "" },
    ...overrides
  };
}

function baseState(activities: any[]) {
  return {
    settings: {
      theme: "dark",
      rooms: [{ name: "Salle A", color: "#000", pricing_grids: [], linked_rooms: [], linked_staff: [], linked_fees: [], linked_tasks: [] }],
      departments: [],
      accounts: [],
      last_backup_date: "",
      backup_reminder_days: 7,
      salaries: [],
      services: [],
      global_tasks: [],
      schedulable_tasks: [],
      tax_rates: { tps: 0.05, tvq: 0.09975 }
    },
    activities,
    favorites: [],
    selected_year: "2025-2026",
    selected_quarters: [1, 2, 3, 4]
  };
}

async function openDrawer(activity: any) {
  setAppState(baseState([activity]));
  activitiesState.selectedIds = new Set();
  activitiesState.draftActivityId = null;
  document.body.innerHTML = `<div id="toast-container"></div>`;
  render(<ActivityDrawer />);
  await act(async () => {
    triggerOpenActivityDrawer(activity.id);
    await flush();
  });
  act(() => {
    fillActivityFormFields(activity);
  });
  await act(async () => {
    await flush();
  });
}

test.beforeEach(() => {
  document.body.innerHTML = `<div id="toast-container"></div>`;
  (globalThis as any).confirm = () => true;
});

test.afterEach(() => cleanup());

test("a blank activity opens with exactly one blank créneau row", async () => {
  await openDrawer(baseActivity({ reservations: [] }));

  const card = document.querySelector<HTMLElement>(".reservation-card")!;
  const rows = card.querySelectorAll(".reservation-slot-row");
  assert.equal(rows.length, 1);
  assert.equal((rows[0].querySelector(".slot-date-input") as HTMLInputElement).value, "");
});

test("+ Créneau adds a row seeded with the next day and the previous row's times", async () => {
  await openDrawer(
    baseActivity({
      reservations: [{ id: "res-1", room_name: "Salle A", slots: [{ date: "2026-06-01", start_time: "09:00", end_time: "17:00" }] }]
    })
  );

  const card = document.querySelector<HTMLElement>(".reservation-card")!;
  act(() => fireEvent.click(card.querySelector(".reservation-add-slot-btn")!));

  const rows = card.querySelectorAll(".reservation-slot-row");
  assert.equal(rows.length, 2);
  assert.equal((rows[1].querySelector(".slot-date-input") as HTMLInputElement).value, "2026-06-02");
  assert.equal((rows[1].querySelector(".slot-start-time-input") as HTMLInputElement).value, "09:00");
  assert.equal((rows[1].querySelector(".slot-end-time-input") as HTMLInputElement).value, "17:00");
});

test("deleting a créneau row removes it and collectReservationsFromForm reflects the change", async () => {
  await openDrawer(
    baseActivity({
      reservations: [
        {
          id: "res-1",
          room_name: "Salle A",
          slots: [
            { date: "2026-07-01", start_time: "09:00", end_time: "17:00" },
            { date: "2026-07-02", start_time: "09:00", end_time: "17:00" }
          ]
        }
      ]
    })
  );

  const card = document.querySelector<HTMLElement>(".reservation-card")!;
  assert.equal(card.querySelectorAll(".reservation-slot-row").length, 2);

  const firstRow = card.querySelector<HTMLElement>(".reservation-slot-row")!;
  act(() => fireEvent.click(firstRow.querySelector(".delete-slot-row-btn")!));

  const remaining = card.querySelectorAll(".reservation-slot-row");
  assert.equal(remaining.length, 1);
  assert.equal((remaining[0].querySelector(".slot-date-input") as HTMLInputElement).value, "2026-07-02");

  const collected = collectReservationsFromForm();
  assert.equal(collected[0].slots.length, 1);
  assert.equal(collected[0].slots[0].date, "2026-07-02");
});

test("editing a créneau's date and autosaving persists it to appState", async () => {
  await openDrawer(
    baseActivity({ reservations: [{ id: "res-1", room_name: "Salle A", slots: [{ date: "2026-08-01", start_time: "", end_time: "" }] }] })
  );

  const card = document.querySelector<HTMLElement>(".reservation-card")!;
  const dateInput = card.querySelector<HTMLInputElement>(".slot-date-input")!;
  act(() => fireEvent.change(dateInput, { target: { value: "2026-08-15" } }));

  await act(async () => {
    await flush(600); // clears the debounced autosave from the form-level onInput handler
  });

  const saved = appState.activities.find(a => a.id === "act-test-1");
  assert.equal(saved?.reservations[0]?.slots[0]?.date, "2026-08-15");
});
