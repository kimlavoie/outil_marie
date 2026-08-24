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

// Covers Salle + Tarif ("sous-tranche D") through the real drawer.

function flush(ms = 150): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const ROOM_A = {
  name: "Salle A",
  color: "#000",
  rate_type: "daily" as const,
  pricing_grids: [
    {
      id: "grid-1",
      effective_date: "",
      parameters: [{ id: "param-1", name: "Tarif standard" }],
      client_types: [
        { id: "ct-interne", name: "Interne", gl_account_code: "GL-INT" },
        { id: "ct-externe", name: "Externe", gl_account_code: "GL-EXT" }
      ],
      cells: [
        { parameter_id: "param-1", client_type_id: "ct-interne", amount: 100 },
        { parameter_id: "param-1", client_type_id: "ct-externe", amount: 200 }
      ]
    }
  ],
  linked_rooms: [] as string[],
  linked_staff: [] as any[],
  linked_fees: [] as any[],
  linked_tasks: [] as any[]
};

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
      rooms: [ROOM_A],
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

test("opening a reservation with a saved room/tariff shows it selected and the resolved price", async () => {
  await openDrawer(
    baseActivity({
      reservations: [
        { id: "res-1", room_name: "Salle A", tariff_id: "param-1::ct-interne", tariff_amount: 100, slots: [{ date: "2026-01-10" }] }
      ]
    })
  );

  const card = document.querySelector<HTMLElement>(".reservation-card")!;
  const roomInput = card.querySelector<HTMLInputElement>(".searchable-select-input")!;
  assert.equal(roomInput.value, "Salle A");
  assert.equal(card.querySelector<HTMLInputElement>(".room-tariff-parameter")!.value, "param-1");
  assert.equal(card.querySelector<HTMLInputElement>(".room-tariff-client-type")!.value, "ct-interne");
  assert.equal(card.querySelector<HTMLElement>(".room-tariff-resolved-price-display")!.style.display, "block");
  assert.match(card.querySelector<HTMLElement>(".resolved-price-val")!.textContent!, /100/);
});

test("picking a room from the combobox reveals the tariff parameter/client-type selects", async () => {
  await openDrawer(baseActivity({ reservations: [{ id: "res-1", room_name: "", slots: [] }] }));

  const card = document.querySelector<HTMLElement>(".reservation-card")!;
  const roomInput = card.querySelector<HTMLInputElement>(".searchable-select-input")!;
  act(() => fireEvent.focus(roomInput));
  const option = Array.from(card.querySelectorAll<HTMLElement>(".searchable-select-option")).find(o => o.textContent?.trim() === "Salle A")!;
  act(() => fireEvent.mouseDown(option));

  assert.equal(roomInput.value, "Salle A");
  const paramSelect = card.querySelector<HTMLSelectElement>(".room-tariff-parameter")!;
  const paramOptions = Array.from(paramSelect.options).map(o => o.textContent);
  assert.ok(paramOptions.includes("Tarif standard"));
});

test("selecting 'Montant personnalisé' hides the client-type select and shows the custom fields", async () => {
  await openDrawer(
    baseActivity({ reservations: [{ id: "res-1", room_name: "Salle A", tariff_id: "param-1::ct-interne", tariff_amount: 100, slots: [] }] })
  );

  const card = document.querySelector<HTMLElement>(".reservation-card")!;
  const paramSelect = card.querySelector<HTMLSelectElement>(".room-tariff-parameter")!;
  act(() => fireEvent.change(paramSelect, { target: { value: "__custom__" } }));

  assert.equal(card.querySelector<HTMLElement>(".room-tariff-client-type-group")!.style.display, "none");
  assert.equal(card.querySelector<HTMLElement>(".room-tariff-custom-group")!.style.display, "flex");
});

test("selecting 'Autre' as the room reveals the room-other-details field", async () => {
  await openDrawer(baseActivity({ reservations: [{ id: "res-1", room_name: "", slots: [] }] }));

  const card = document.querySelector<HTMLElement>(".reservation-card")!;
  const roomInput = card.querySelector<HTMLInputElement>(".searchable-select-input")!;
  act(() => fireEvent.focus(roomInput));
  const otherOption = Array.from(card.querySelectorAll<HTMLElement>(".searchable-select-option")).find(o => o.textContent?.trim() === "Autre")!;
  act(() => fireEvent.mouseDown(otherOption));

  assert.equal(card.querySelector<HTMLElement>(".room-other-details-group")!.style.display, "flex");
});

test("collectReservationsFromForm and autosave persist the selected room/tariff", async () => {
  await openDrawer(
    baseActivity({ reservations: [{ id: "res-1", room_name: "Salle A", tariff_id: "param-1::ct-interne", tariff_amount: 100, slots: [] }] })
  );

  const card = document.querySelector<HTMLElement>(".reservation-card")!;
  const ctSelect = card.querySelector<HTMLSelectElement>(".room-tariff-client-type")!;
  act(() => fireEvent.change(ctSelect, { target: { value: "ct-externe" } }));

  await act(async () => {
    await flush(600);
  });

  const collected = collectReservationsFromForm();
  assert.equal(collected[0].tariff_id, "param-1::ct-externe");
  assert.equal(collected[0].tariff_amount, 200);

  const saved = appState.activities.find(a => a.id === "act-test-1");
  assert.equal(saved?.reservations[0]?.tariff_id, "param-1::ct-externe");
});
