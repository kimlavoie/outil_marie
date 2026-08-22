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

// These tests used to drive activities/form.ts's imperative DOM writes (applyResponsableSameAsManager/
// updateResponsableClientTypeDisplay) directly against a hand-built fixture. That logic now lives as
// React-controlled state in components/activities/ActivityDrawer.tsx (see that file's "Seed the
// React-controlled Responsable fields" effect and the ones right after it), so these tests drive the
// real rendered drawer instead.

function flush(ms = 100): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function baseActivity(overrides: any = {}) {
  return {
    id: "act-test-1",
    mode: "soumission",
    state: "brouillon",
    name: "Événement Externe",
    responsable_first_name: "Jean",
    responsable_last_name: "Dupont",
    client_type: "externe",
    responsable_address: "456 rue Est",
    responsable_city: "Québec",
    responsable_province: "QC",
    responsable_postal_code: "G1K 2L3",
    responsable_same_as_manager: false,
    activity_manager: {
      first_name: "Marie",
      last_name: "Tremblay",
      type: "externe",
      address: "123 rue Ouest",
      city: "Montréal",
      province: "QC",
      postal_code: "H2X 1Y2"
    },
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
      departments: ["DG", "RH"],
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
  // ActivityDrawer's own setTimeout(..., 50)-based population effect is timing-sensitive in this
  // test environment (real setTimeout racing against act()'s async flushing) — call the same
  // legacy population function directly, exactly like this file's tests did before the Responsable
  // fields moved into React state, so name/manager fields are deterministically populated before
  // each test interacts with the drawer.
  act(() => {
    fillActivityFormFields(activity);
  });
}

test.beforeEach(() => {
  document.body.innerHTML = `<div id="toast-container"></div>`;
});

test.afterEach(() => cleanup());

test("selecting client type 'externe' shows address fields and hides department", async () => {
  await openDrawer(baseActivity({ client_type: "interne" }));

  const clientTypeSelect = document.getElementById("form-activity-client-type") as HTMLSelectElement;
  const deptGroup = document.getElementById("form-activity-dept-group") as HTMLElement;
  const extGroup = document.getElementById("form-activity-responsable-external-group") as HTMLElement;

  assert.equal(deptGroup.style.display, "block");
  assert.equal(extGroup.style.display, "none");

  fireEvent.change(clientTypeSelect, { target: { value: "externe" } });
  assert.equal(deptGroup.style.display, "none");
  assert.equal(extGroup.style.display, "block");

  fireEvent.change(clientTypeSelect, { target: { value: "interne" } });
  assert.equal(deptGroup.style.display, "block");
  assert.equal(extGroup.style.display, "none");
});

test("checking same_as_manager copies and locks manager address to responsable address", async () => {
  await openDrawer(baseActivity());

  const sameCb = document.getElementById("form-activity-responsable-same-as-manager") as HTMLInputElement;
  const respAddr = document.getElementById("form-activity-responsable-address") as HTMLInputElement;
  const respCity = document.getElementById("form-activity-responsable-city") as HTMLInputElement;

  fireEvent.click(sameCb);

  assert.equal(respAddr.value, "123 rue Ouest");
  assert.equal(respCity.value, "Montréal");
  assert.equal(respAddr.readOnly, true);
  assert.equal(respCity.readOnly, true);

  // Updating manager address input mirrors to responsable address
  const mgrAddr = document.getElementById("form-activity-manager-address") as HTMLInputElement;
  fireEvent.input(mgrAddr, { target: { value: "789 Nouveaux Boulevards" } });

  assert.equal(respAddr.value, "789 Nouveaux Boulevards");
});

test("autoSaveActivityForm persists responsable address when client type is externe", async () => {
  await openDrawer(baseActivity());

  const respAddr = document.getElementById("form-activity-responsable-address") as HTMLInputElement;
  const respCity = document.getElementById("form-activity-responsable-city") as HTMLInputElement;
  const respProv = document.getElementById("form-activity-responsable-province") as HTMLInputElement;
  const respPc = document.getElementById("form-activity-responsable-postal-code") as HTMLInputElement;

  fireEvent.change(respAddr, { target: { value: "999 Boulevard Wilfrid" } });
  fireEvent.change(respCity, { target: { value: "Laval" } });
  fireEvent.change(respProv, { target: { value: "QC" } });
  fireEvent.change(respPc, { target: { value: "H7T 2H6" } });

  autoSaveActivityForm();

  const savedAct = appState.activities.find(a => a.id === "act-test-1");
  assert.equal(savedAct?.client_type, "externe");
  assert.equal(savedAct?.responsable_address, "999 Boulevard Wilfrid");
  assert.equal(savedAct?.responsable_city, "Laval");
  assert.equal(savedAct?.responsable_province, "QC");
  assert.equal(savedAct?.responsable_postal_code, "H7T 2H6");
  assert.equal(savedAct?.department, "");
});

test("selecting external manager and checking same_as_manager locks client_type to externe", async () => {
  await openDrawer(baseActivity({ client_type: "interne", activity_manager: { ...baseActivity().activity_manager, type: "employe" } }));

  const managerTypeSelect = document.getElementById("form-activity-manager-type") as HTMLSelectElement;
  const sameCb = document.getElementById("form-activity-responsable-same-as-manager") as HTMLInputElement;
  const clientTypeSelect = document.getElementById("form-activity-client-type") as HTMLSelectElement;

  assert.equal(clientTypeSelect.disabled, false);

  // Set manager type to externe
  fireEvent.change(managerTypeSelect, { target: { value: "externe" } });

  // Client type should still be editable until sameCb is checked
  assert.equal(clientTypeSelect.disabled, false);

  // Check same_as_manager
  fireEvent.click(sameCb);

  // Now client_type should be set to "externe", disabled, and styled as readonly
  assert.equal(clientTypeSelect.value, "externe");
  assert.equal(clientTypeSelect.disabled, true);
  assert.equal(clientTypeSelect.classList.contains("form-input-readonly"), true);

  // Changing manager type back to employe unlocks client_type
  fireEvent.change(managerTypeSelect, { target: { value: "employe" } });
  assert.equal(clientTypeSelect.disabled, false);
  assert.equal(clientTypeSelect.classList.contains("form-input-readonly"), false);

  // Changing manager type back to externe locks client_type again
  fireEvent.change(managerTypeSelect, { target: { value: "externe" } });
  assert.equal(clientTypeSelect.value, "externe");
  assert.equal(clientTypeSelect.disabled, true);
  assert.equal(clientTypeSelect.classList.contains("form-input-readonly"), true);

  // Unchecking same_as_manager unlocks client_type
  fireEvent.click(sameCb);
  assert.equal(clientTypeSelect.disabled, false);
  assert.equal(clientTypeSelect.classList.contains("form-input-readonly"), false);
});

test("opening an activity with an external manager and same_as_manager already set locks client_type to externe", async () => {
  await openDrawer(
    baseActivity({
      client_type: "interne",
      responsable_same_as_manager: true,
      activity_manager: { first_name: "Paul", last_name: "Durand", type: "externe" }
    })
  );

  const clientTypeSelect = document.getElementById("form-activity-client-type") as HTMLSelectElement;
  assert.equal(clientTypeSelect.value, "externe");
  assert.equal(clientTypeSelect.disabled, true);
  assert.equal(clientTypeSelect.classList.contains("form-input-readonly"), true);
});
