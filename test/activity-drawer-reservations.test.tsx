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

// Covers the reservation-card shell (Phase-1-style "sub-tranche A": add/remove is React state
// now, card *content* is still built by the legacy addReservationCard() — see that file and
// ActivityDrawer.tsx's reservationCardIds state/mountReservationCard for the split).

function flush(ms = 100): Promise<void> {
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
}

test.beforeEach(() => {
  document.body.innerHTML = `<div id="toast-container"></div>`;
});

test.afterEach(() => cleanup());

test("opening an activity with no reservations auto-adds one blank card with one blank créneau", async () => {
  await openDrawer(baseActivity({ reservations: [] }));

  const cards = document.querySelectorAll("#form-activity-reservations .reservation-card");
  assert.equal(cards.length, 1);
  assert.equal(cards[0].querySelectorAll(".reservation-slot-row").length, 1);
});

test("opening an activity with existing reservations renders one card per reservation", async () => {
  const activity = baseActivity({
    reservations: [
      { id: "res-1", room_name: "Salle A", slots: [{ date: "2026-01-10", start_time: "09:00", end_time: "17:00" }] },
      { id: "res-2", room_name: "", slots: [] }
    ]
  });
  await openDrawer(activity);

  const cards = document.querySelectorAll<HTMLElement>("#form-activity-reservations .reservation-card");
  assert.equal(cards.length, 2);
  assert.equal(cards[0].dataset.reservationId, "res-1");
  assert.equal(cards[1].dataset.reservationId, "res-2");
});

test("+ Ajouter une réservation adds a new card and carries over the previous card's créneaux", async () => {
  const activity = baseActivity({
    reservations: [
      { id: "res-1", room_name: "Salle A", slots: [{ date: "2026-02-01", start_time: "08:00", end_time: "12:00" }] }
    ]
  });
  await openDrawer(activity);

  assert.equal(document.querySelectorAll("#form-activity-reservations .reservation-card").length, 1);

  act(() => {
    fireEvent.click(document.getElementById("add-reservation-btn")!);
  });

  const cards = document.querySelectorAll("#form-activity-reservations .reservation-card");
  assert.equal(cards.length, 2);

  const newCardSlots = cards[1].querySelectorAll(".reservation-slot-row");
  assert.equal(newCardSlots.length, 1);
  const dateInput = cards[1].querySelector<HTMLInputElement>(".reservation-slot-row input[type='text']");
  assert.equal(dateInput?.value, "2026-02-01");
});

test("removing a reservation card removes only that card and its data from collectReservationsFromForm", async () => {
  const activity = baseActivity({
    reservations: [
      { id: "res-1", room_name: "Salle A", slots: [] },
      { id: "res-2", room_name: "", slots: [] }
    ]
  });
  await openDrawer(activity);

  const cards = document.querySelectorAll<HTMLElement>("#form-activity-reservations .reservation-card");
  assert.equal(cards.length, 2);

  act(() => {
    fireEvent.click(cards[0].querySelector(".remove-reservation-btn")!);
  });

  const remaining = document.querySelectorAll<HTMLElement>("#form-activity-reservations .reservation-card");
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].dataset.reservationId, "res-2");

  const collected = collectReservationsFromForm();
  assert.equal(collected.length, 1);
  assert.equal(collected[0].id, "res-2");
});
