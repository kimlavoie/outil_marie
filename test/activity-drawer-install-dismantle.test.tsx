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

// Covers Montage/Démontage ("sous-tranche B" of the reservations React conversion) —
// InstallDismantleFields.tsx, mounted as its own React root by ActivityDrawer.tsx's
// mountReservationCard() into the .reservation-install-dismantle-mount placeholder card.ts
// leaves in each card.

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

test("Montage/Démontage fields start hidden and appear when the toggle is clicked", async () => {
  await openDrawer(baseActivity({ reservations: [{ id: "res-1", room_name: "Salle A", slots: [] }] }));

  const card = document.querySelector<HTMLElement>(".reservation-card")!;
  const installFields = card.querySelector<HTMLElement>(".reservation-install-fields")!;
  assert.equal(installFields.style.display, "none");

  const installToggle = card.querySelector<HTMLElement>(".reservation-install-toggle")!;
  act(() => {
    fireEvent.click(installToggle);
  });

  assert.ok(installToggle.classList.contains("active"));
  assert.equal(installFields.style.display, "flex");
});

test("toggling install off then back on keeps a value typed in the date field", async () => {
  await openDrawer(baseActivity({ reservations: [{ id: "res-1", room_name: "Salle A", slots: [] }] }));

  const card = document.querySelector<HTMLElement>(".reservation-card")!;
  const installToggle = card.querySelector<HTMLElement>(".reservation-install-toggle")!;

  act(() => fireEvent.click(installToggle));
  const dateInput = card.querySelector<HTMLInputElement>(".reservation-install-fields input[type='text']")!;
  act(() => fireEvent.change(dateInput, { target: { value: "2026-03-15" } }));
  assert.equal(dateInput.value, "2026-03-15");

  act(() => fireEvent.click(installToggle)); // off
  assert.equal(card.querySelector<HTMLElement>(".reservation-install-fields")!.style.display, "none");

  act(() => fireEvent.click(installToggle)); // back on
  assert.equal(card.querySelector<HTMLElement>(".reservation-install-fields")!.style.display, "flex");
  assert.equal(dateInput.value, "2026-03-15");
});

test("opening an activity with install/dismantle already enabled pre-fills and shows the fields", async () => {
  await openDrawer(
    baseActivity({
      reservations: [
        {
          id: "res-1",
          room_name: "Salle A",
          slots: [],
          install: { enabled: true, date: "2026-04-01", start_time: "08:00", end_time: "10:00" },
          dismantle: { enabled: true, date: "2026-04-05", start_time: "16:00", end_time: "18:00" }
        }
      ]
    })
  );

  const card = document.querySelector<HTMLElement>(".reservation-card")!;
  assert.ok(card.querySelector(".reservation-install-toggle")!.classList.contains("active"));
  assert.ok(card.querySelector(".reservation-dismantle-toggle")!.classList.contains("active"));
  assert.equal(card.querySelector<HTMLElement>(".reservation-install-fields")!.style.display, "flex");
  assert.equal(card.querySelector<HTMLElement>(".reservation-dismantle-fields")!.style.display, "flex");

  const installDateInput = card.querySelector<HTMLInputElement>(".reservation-install-fields input[type='text']")!;
  assert.equal(installDateInput.value, "2026-04-01");
});

test("collectReservationsFromForm reports install/dismantle enabled + values after toggling on and filling the fields", async () => {
  await openDrawer(baseActivity({ reservations: [{ id: "res-1", room_name: "Salle A", slots: [] }] }));

  const card = document.querySelector<HTMLElement>(".reservation-card")!;
  act(() => fireEvent.click(card.querySelector<HTMLElement>(".reservation-install-toggle")!));

  const dateInput = card.querySelector<HTMLInputElement>(".reservation-install-fields input[type='text']")!;
  const startTimeInput = card.querySelectorAll<HTMLInputElement>(".reservation-install-fields input[type='time']")[0];
  act(() => {
    fireEvent.change(dateInput, { target: { value: "2026-05-10" } });
    fireEvent.change(startTimeInput, { target: { value: "07:30" } });
  });

  const collected = collectReservationsFromForm();
  assert.equal(collected.length, 1);
  assert.equal(collected[0].install.enabled, true);
  assert.equal(collected[0].install.date, "2026-05-10");
  assert.equal(collected[0].install.start_time, "07:30");
  assert.equal(collected[0].dismantle.enabled, false);
  assert.equal(collected[0].dismantle.date, "");
});
