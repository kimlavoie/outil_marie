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

// Covers Services techniques / Service de bar / Autres services ("sous-tranche E") through the
// real drawer.

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
});

test.afterEach(() => cleanup());

test("activating the bar service reveals its details, deactivating hides them and clears the sub-fields", async () => {
  await openDrawer(baseActivity({ reservations: [{ id: "res-1", room_name: "", slots: [] }] }));

  const card = document.querySelector<HTMLElement>(".reservation-card")!;
  const barToggle = card.querySelector<HTMLElement>(".room-bar-toggle-group .pill-toggle")!;
  const barDetails = card.querySelector<HTMLElement>(".room-bar-details")!;
  assert.equal(barDetails.style.display, "none");

  act(() => fireEvent.click(barToggle));
  assert.equal(barDetails.style.display, "block");

  const drinkPill = card.querySelector<HTMLElement>(".room-bar-drink-group .pill-toggle")!;
  act(() => fireEvent.click(drinkPill));
  assert.ok(drinkPill.classList.contains("active"));

  act(() => fireEvent.click(barToggle)); // deactivate
  assert.equal(barDetails.style.display, "none");
  assert.equal(drinkPill.classList.contains("active"), false);
});

test("picking a bar service type that needs hostesses reveals the hostess-count field", async () => {
  await openDrawer(baseActivity({ reservations: [{ id: "res-1", room_name: "", slots: [] }] }));

  const card = document.querySelector<HTMLElement>(".reservation-card")!;
  act(() => fireEvent.click(card.querySelector<HTMLElement>(".room-bar-toggle-group .pill-toggle")!));

  const hostessTypeBtn = Array.from(card.querySelectorAll<HTMLElement>(".room-bar-service-type-group .pill-toggle")).find(
    b => b.dataset.value === "Service d'hôtesses"
  )!;
  const hostessCountGroup = card.querySelector<HTMLElement>(".room-bar-hostess-count-group")!;
  assert.equal(hostessCountGroup.style.display, "none");

  act(() => fireEvent.click(hostessTypeBtn));
  assert.equal(hostessCountGroup.style.display, "flex");
});

test("selecting an 'Autres services' (host duties) option reveals the hostess-count field", async () => {
  await openDrawer(baseActivity({ reservations: [{ id: "res-1", room_name: "", slots: [] }] }));

  const card = document.querySelector<HTMLElement>(".reservation-card")!;
  const dutyBtn = card.querySelector<HTMLElement>(".room-host-duties-group .pill-toggle")!;
  const countGroup = card.querySelector<HTMLElement>(".room-host-duties-count-group")!;
  assert.equal(countGroup.style.display, "none");

  act(() => fireEvent.click(dutyBtn));
  assert.equal(countGroup.style.display, "flex");

  act(() => fireEvent.click(dutyBtn));
  assert.equal(countGroup.style.display, "none");
});

test("opening a reservation with saved bar service / host duties pre-fills and shows them", async () => {
  await openDrawer(
    baseActivity({
      reservations: [
        {
          id: "res-1",
          room_name: "",
          slots: [],
          bar_service: { active: true, drink_type: "Avec alcool", service_type: "Service d'hôtesses", hostess_count: 3, special_order: "Glaçons" },
          host_duties: { duties: ["Distribution de bouchées"], hostess_count: 2 }
        }
      ]
    })
  );

  const card = document.querySelector<HTMLElement>(".reservation-card")!;
  assert.ok(card.querySelector(".room-bar-toggle-group .pill-toggle")!.classList.contains("active"));
  assert.equal(card.querySelector<HTMLElement>(".room-bar-details")!.style.display, "block");
  assert.equal(card.querySelector<HTMLInputElement>(".room-bar-hostess-count")!.value, "3");
  assert.equal(card.querySelector<HTMLInputElement>(".room-bar-special-order")!.value, "Glaçons");
  assert.equal(card.querySelector<HTMLElement>(".room-host-duties-count-group")!.style.display, "flex");
  assert.equal(card.querySelector<HTMLInputElement>(".room-host-duties-count")!.value, "2");
});

test("collectReservationsFromForm reports bar service and host duties after interacting with the pills", async () => {
  await openDrawer(baseActivity({ reservations: [{ id: "res-1", room_name: "", slots: [] }] }));

  const card = document.querySelector<HTMLElement>(".reservation-card")!;
  act(() => fireEvent.click(card.querySelector<HTMLElement>(".room-bar-toggle-group .pill-toggle")!));
  act(() =>
    fireEvent.click(Array.from(card.querySelectorAll<HTMLElement>(".room-bar-drink-group .pill-toggle")).find(b => b.dataset.value === "Avec alcool")!)
  );
  act(() =>
    fireEvent.click(card.querySelector<HTMLElement>(".room-technical-services-group .pill-toggle")!)
  );

  const collected = collectReservationsFromForm();
  assert.equal(collected[0].bar_service.active, true);
  assert.equal(collected[0].bar_service.drink_type, "Avec alcool");
  assert.equal(collected[0].technical_services.length, 1);
});
