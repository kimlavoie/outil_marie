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
(globalThis as any).confirm = () => true;

import { act } from "react";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { setAppState, appState } from "../src/state/state.ts";
import { activitiesState } from "../src/activities/render.ts";
import { fillActivityFormFields } from "../src/activities/form.ts";
import { collectReservationsFromForm } from "../src/activities/reservations/index.ts";
import { ActivityDrawer, triggerOpenActivityDrawer } from "../src/components/activities/ActivityDrawer.tsx";

// Covers Personnel requis / Équipements / Autres frais ("sous-tranche F", the last one) through
// the real drawer, plus the cross-root auto-add wiring it deliberately stays imperative for
// (BarHostTechFields.tsx's technical-services toggle, RoomTariffFields.tsx's room select).

function flush(ms = 150): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const SALARY_DT = {
  id: "salary-dt",
  job: "Directeur technique",
  rate_versions: [{ id: "rv-dt", effective_date: "", rate: 50, overtime_rate: 75 }]
};
const SALARY_TECH = {
  id: "salary-tech",
  job: "Technicien",
  rate_versions: [{ id: "rv-tech", effective_date: "", rate: 30 }]
};
const SERVICE_PROJECTOR = {
  id: "service-location-projecteur",
  name: "Projecteur",
  type: "hourly" as const,
  tarifs: [{ id: "tarif-proj", label: "Standard", gl_account_code: "", rate_versions: [{ id: "rv-proj", effective_date: "", rate: 15 }] }]
};

const ROOM_LINKED = {
  name: "Salle Liée",
  color: "#000",
  pricing_grids: [],
  linked_rooms: [] as string[],
  linked_staff: [{ id: "ls-1", salary_id: "salary-tech", count: 1 }],
  linked_fees: [{ id: "lf-1", description: "Frais de nettoyage", amount: 25 }],
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
      rooms: [ROOM_LINKED],
      departments: [],
      accounts: [],
      last_backup_date: "",
      backup_reminder_days: 7,
      salaries: [SALARY_DT, SALARY_TECH],
      services: [SERVICE_PROJECTOR],
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

test("+ Ajouter adds a staff/service/fee row in each section", async () => {
  await openDrawer(baseActivity({ reservations: [{ id: "res-1", room_name: "", slots: [] }] }));

  const card = document.querySelector<HTMLElement>(".reservation-card")!;
  assert.equal(card.querySelectorAll(".room-staff-list .distribution-row").length, 0);
  assert.equal(card.querySelectorAll(".room-services-list .distribution-row").length, 0);
  assert.equal(card.querySelectorAll(".room-fees-list .distribution-row").length, 0);

  act(() => fireEvent.click(card.querySelector(".room-add-staff-btn")!));
  act(() => fireEvent.click(card.querySelector(".room-add-service-btn")!));
  act(() => fireEvent.click(card.querySelector(".room-add-fee-btn")!));

  assert.equal(card.querySelectorAll(".room-staff-list .distribution-row").length, 1);
  assert.equal(card.querySelectorAll(".room-services-list .distribution-row").length, 1);
  assert.equal(card.querySelectorAll(".room-fees-list .distribution-row").length, 1);
});

test("opening a reservation with saved staff/services/fees pre-fills all three lists", async () => {
  await openDrawer(
    baseActivity({
      reservations: [
        {
          id: "res-1",
          room_name: "",
          slots: [],
          staff: [{ salary_id: "salary-tech", date: "2026-01-05", hours: 4 }],
          services: [{ service_id: "service-location-projecteur", hours: 2, tarif_id: "tarif-proj" }],
          fees: [{ description: "Location de scène", amount: 100 }]
        }
      ]
    })
  );

  const card = document.querySelector<HTMLElement>(".reservation-card")!;
  assert.equal(card.querySelector<HTMLSelectElement>(".staff-salary-select")!.value, "salary-tech");
  assert.equal(card.querySelector<HTMLInputElement>(".staff-hours-input")!.value, "4");
  assert.equal(card.querySelector<HTMLSelectElement>(".service-select")!.value, "service-location-projecteur");
  assert.equal(card.querySelector<HTMLInputElement>(".fee-desc-input")!.value, "Location de scène");
  assert.equal(card.querySelector<HTMLInputElement>(".fee-amount-input")!.value, "100");
});

test("removing a staff row deletes it after confirmation", async () => {
  await openDrawer(
    baseActivity({ reservations: [{ id: "res-1", room_name: "", slots: [], staff: [{ salary_id: "salary-tech", hours: 2 }] }] })
  );

  const card = document.querySelector<HTMLElement>(".reservation-card")!;
  assert.equal(card.querySelectorAll(".room-staff-list .distribution-row").length, 1);

  act(() => fireEvent.click(card.querySelector(".delete-staff-row-btn")!));

  assert.equal(card.querySelectorAll(".room-staff-list .distribution-row").length, 0);
});

test("picking a room with linked staff/fees (RoomTariffFields' auto-add) adds them into the still-imperative lists without React clobbering them", async () => {
  // A truly blank reservation (reservations: []) — auto-add only fires for a brand-new card with
  // no reservationData at all, exactly like the original code (hasAutoAddedLinked = !!reservationData
  // starts true otherwise, e.g. an existing-but-roomless reservation being edited).
  await openDrawer(baseActivity({ reservations: [] }));

  const card = document.querySelector<HTMLElement>(".reservation-card")!;
  const roomInput = card.querySelector<HTMLInputElement>(".searchable-select-input")!;
  act(() => fireEvent.focus(roomInput));
  const option = Array.from(card.querySelectorAll<HTMLElement>(".searchable-select-option")).find(o => o.textContent?.trim() === "Salle Liée")!;
  act(() => fireEvent.mouseDown(option));

  assert.equal(card.querySelectorAll(".room-staff-list .distribution-row").length, 1);
  assert.equal(card.querySelector<HTMLSelectElement>(".staff-salary-select")!.value, "salary-tech");
  assert.equal(card.querySelectorAll(".room-fees-list .distribution-row").length, 1);
  assert.equal(card.querySelector<HTMLInputElement>(".fee-desc-input")!.value, "Frais de nettoyage");

  // The row survives further interaction with this same card (no stale-reconciliation wipeout).
  act(() => fireEvent.click(card.querySelector(".room-add-fee-btn")!));
  assert.equal(card.querySelectorAll(".room-fees-list .distribution-row").length, 2);
  assert.equal(card.querySelector<HTMLInputElement>(".fee-desc-input")!.value, "Frais de nettoyage");
});

test("collectReservationsFromForm/autosave persist staff, services and fees", async () => {
  await openDrawer(baseActivity({ reservations: [{ id: "res-1", room_name: "", slots: [] }] }));

  const card = document.querySelector<HTMLElement>(".reservation-card")!;
  act(() => fireEvent.click(card.querySelector(".room-add-fee-btn")!));
  const descInput = card.querySelector<HTMLInputElement>(".fee-desc-input")!;
  const amountInput = card.querySelector<HTMLInputElement>(".fee-amount-input")!;
  act(() => fireEvent.change(descInput, { target: { value: "Assurance" } }));
  act(() => fireEvent.change(amountInput, { target: { value: "50" } }));

  await act(async () => {
    await flush(600);
  });

  const collected = collectReservationsFromForm();
  assert.equal(collected[0].fees.length, 1);
  assert.equal(collected[0].fees[0].description, "Assurance");
  assert.equal(collected[0].fees[0].amount, 50);

  // `fees` isn't part of types/activity.ts's (currently stale) Reservation interface — the actual
  // runtime shape used throughout reservations/*.ts, both before and after this conversion.
  const saved = appState.activities.find(a => a.id === "act-test-1") as any;
  assert.equal(saved?.reservations[0]?.fees[0]?.description, "Assurance");
});
