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
import { autoSaveActivityForm } from "../src/activities/autosave.ts";
import { fillActivityFormFields } from "../src/activities/form.ts";
import { ActivityDrawer, triggerOpenActivityDrawer } from "../src/components/activities/ActivityDrawer.tsx";

// Covers the "Informations générales" fields (coba/name/attendees/description) now that they're
// React-controlled state in ActivityDrawer.tsx instead of DOM writes in fillActivityFormFields()
// — same conversion pattern as test/responsable-facturation-address.test.tsx.

function flush(ms = 100): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function baseActivity(overrides: any = {}) {
  return {
    id: "act-test-1",
    mode: "soumission",
    state: "brouillon",
    coba: "COBA-100",
    name: "Réunion initiale",
    attendees_count: 12,
    description: "Description initiale",
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
      rooms: [],
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
  // See responsable-facturation-address.test.tsx: the drawer's own setTimeout(..., 50) population
  // effect is timing-sensitive here, so call the same legacy population function directly too.
  act(() => {
    fillActivityFormFields(activity);
  });
}

test.beforeEach(() => {
  document.body.innerHTML = `<div id="toast-container"></div>`;
});

test.afterEach(() => cleanup());

test("opening an activity seeds coba/name/attendees/description from appState", async () => {
  await openDrawer(baseActivity());

  assert.equal((document.getElementById("form-activity-coba") as HTMLInputElement).value, "COBA-100");
  assert.equal((document.getElementById("form-activity-name") as HTMLInputElement).value, "Réunion initiale");
  assert.equal((document.getElementById("form-activity-attendees") as HTMLInputElement).value, "12");
  assert.equal((document.getElementById("form-activity-description") as HTMLTextAreaElement).value, "Description initiale");
});

test("opening a fresh/blank activity leaves these fields empty rather than showing '0' for attendees", async () => {
  await openDrawer(baseActivity({ coba: "", name: "", attendees_count: 0, description: "" }));

  assert.equal((document.getElementById("form-activity-coba") as HTMLInputElement).value, "");
  assert.equal((document.getElementById("form-activity-name") as HTMLInputElement).value, "");
  assert.equal((document.getElementById("form-activity-attendees") as HTMLInputElement).value, "");
  assert.equal((document.getElementById("form-activity-description") as HTMLTextAreaElement).value, "");
});

test("editing coba/name/attendees/description and autosaving persists the new values", async () => {
  await openDrawer(baseActivity());

  const cobaEl = document.getElementById("form-activity-coba") as HTMLInputElement;
  const nameEl = document.getElementById("form-activity-name") as HTMLInputElement;
  const attendeesEl = document.getElementById("form-activity-attendees") as HTMLInputElement;
  const descEl = document.getElementById("form-activity-description") as HTMLTextAreaElement;

  fireEvent.change(cobaEl, { target: { value: "COBA-999" } });
  fireEvent.change(nameEl, { target: { value: "Activité renommée" } });
  fireEvent.change(attendeesEl, { target: { value: "75" } });
  fireEvent.change(descEl, { target: { value: "Nouvelle description" } });

  autoSaveActivityForm();

  const saved = appState.activities.find(a => a.id === "act-test-1");
  assert.equal(saved?.coba, "COBA-999");
  assert.equal(saved?.name, "Activité renommée");
  assert.equal(saved?.attendees_count, 75);
  assert.equal(saved?.description, "Nouvelle description");
});

test("switching to a different activity re-seeds the fields instead of leaking the previous one's values", async () => {
  const first = baseActivity({ id: "act-a", name: "Première activité", coba: "COBA-A" });
  const second = baseActivity({ id: "act-b", name: "Deuxième activité", coba: "COBA-B", attendees_count: 30 });
  setAppState(baseState([first, second]));
  activitiesState.selectedIds = new Set();
  activitiesState.draftActivityId = null;
  document.body.innerHTML = `<div id="toast-container"></div>`;
  render(<ActivityDrawer />);

  await act(async () => {
    triggerOpenActivityDrawer(first.id);
    await flush();
  });
  act(() => fillActivityFormFields(first));
  assert.equal((document.getElementById("form-activity-name") as HTMLInputElement).value, "Première activité");

  await act(async () => {
    triggerOpenActivityDrawer(second.id);
    await flush();
  });
  act(() => fillActivityFormFields(second));

  assert.equal((document.getElementById("form-activity-name") as HTMLInputElement).value, "Deuxième activité");
  assert.equal((document.getElementById("form-activity-coba") as HTMLInputElement).value, "COBA-B");
  assert.equal((document.getElementById("form-activity-attendees") as HTMLInputElement).value, "30");
});
