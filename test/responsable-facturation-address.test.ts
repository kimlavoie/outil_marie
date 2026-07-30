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

import { setAppState, appState } from "../src/state/state.ts";
import { renderActivityDrawerShell } from "../src/activities/drawer-template.ts";
import { initFormHandlers, fillActivityFormFields } from "../src/activities/form.ts";
import { autoSaveActivityForm } from "../src/activities/autosave.ts";

function setupForm() {
  document.body.innerHTML = `
    <div id="drawer-backdrop"></div>
    <div id="activity-drawer"></div>
    <button id="add-activity-btn-quick"></button>
    <button id="add-estimation-btn-quick"></button>
    <button id="activity-drawer-close"></button>
    <div id="accordion-section-financial-summary">
      <div id="submission-financial-summary"></div>
    </div>
    <button id="activity-drawer-back-to-calendar-btn"></button>
    <button id="form-add-distribution-btn"></button>
    <button id="generate-planning-tasks-btn"></button>
    <button id="add-planning-task-btn"></button>
    <button id="generate-billing-lines-btn"></button>
    <div id="activity-mode-toggle"></div>
    <input id="activity-search" value="">
    <div id="filter-salle-panel"></div>
    <div id="filter-client-type-panel"></div>
    <div id="filter-status-panel"></div>
    <div id="auto-save-status"><span class="auto-save-spinner"></span><span class="auto-save-text"></span></div>
    <div id="form-distribution-list"></div>
    <div id="form-distribution-total-val"></div>
  `;
  renderActivityDrawerShell();
  initFormHandlers();
}

function baseState() {
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
    activities: [
      {
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
        submission: { file_link_id: "", generated_at: "", sent_at: "" },
        contract: { file_link_id: "", approved_at: "" },
        form: { file_link_id: "", linked_at: "" },
        supporting_docs: { folder_link_id: "", linked_at: "" }
      }
    ],
    favorites: [],
    selected_year: "2025-2026",
    selected_quarters: [1, 2, 3, 4]
  };
}

test.beforeEach(() => {
  setAppState(baseState());
  setupForm();
});

test("selecting client type 'externe' shows address fields and hides department", () => {
  const clientTypeSelect = document.getElementById("form-activity-client-type") as HTMLSelectElement;
  const deptGroup = document.getElementById("form-activity-dept-group") as HTMLElement;
  const extGroup = document.getElementById("form-activity-responsable-external-group") as HTMLElement;

  clientTypeSelect.value = "externe";
  clientTypeSelect.dispatchEvent(new Event("change"));

  assert.equal(deptGroup.style.display, "none");
  assert.equal(extGroup.style.display, "block");

  clientTypeSelect.value = "interne";
  clientTypeSelect.dispatchEvent(new Event("change"));

  assert.equal(deptGroup.style.display, "block");
  assert.equal(extGroup.style.display, "none");
});

test("checking same_as_manager copies and locks manager address to responsable address", () => {
  const activity = appState.activities[0];
  fillActivityFormFields(activity);

  const sameCb = document.getElementById("form-activity-responsable-same-as-manager") as HTMLInputElement;
  const respAddr = document.getElementById("form-activity-responsable-address") as HTMLInputElement;
  const respCity = document.getElementById("form-activity-responsable-city") as HTMLInputElement;

  sameCb.checked = true;
  sameCb.dispatchEvent(new Event("change"));

  assert.equal(respAddr.value, "123 rue Ouest");
  assert.equal(respCity.value, "Montréal");
  assert.equal(respAddr.readOnly, true);
  assert.equal(respCity.readOnly, true);

  // Updating manager address input mirrors to responsable address
  const mgrAddr = document.getElementById("form-activity-manager-address") as HTMLInputElement;
  mgrAddr.value = "789 Nouveaux Boulevards";
  mgrAddr.dispatchEvent(new Event("input"));

  assert.equal(respAddr.value, "789 Nouveaux Boulevards");
});

test("autoSaveActivityForm persists responsable address when client type is externe", () => {
  const internalId = document.getElementById("form-activity-internal-id") as HTMLInputElement;
  const rawId = document.getElementById("form-activity-id") as HTMLInputElement;
  const nameInput = document.getElementById("form-activity-name") as HTMLInputElement;
  const clientTypeSelect = document.getElementById("form-activity-client-type") as HTMLSelectElement;
  const respAddr = document.getElementById("form-activity-responsable-address") as HTMLInputElement;
  const respCity = document.getElementById("form-activity-responsable-city") as HTMLInputElement;
  const respProv = document.getElementById("form-activity-responsable-province") as HTMLInputElement;
  const respPc = document.getElementById("form-activity-responsable-postal-code") as HTMLInputElement;

  internalId.value = "act-test-1";
  rawId.value = "act-test-1";
  nameInput.value = "Activité Externe Test";
  clientTypeSelect.value = "externe";
  respAddr.value = "999 Boulevard Wilfrid";
  respCity.value = "Laval";
  respProv.value = "QC";
  respPc.value = "H7T 2H6";

  autoSaveActivityForm();

  const savedAct = appState.activities.find(a => a.id === "act-test-1");
  assert.equal(savedAct?.client_type, "externe");
  assert.equal(savedAct?.responsable_address, "999 Boulevard Wilfrid");
  assert.equal(savedAct?.responsable_city, "Laval");
  assert.equal(savedAct?.responsable_province, "QC");
  assert.equal(savedAct?.responsable_postal_code, "H7T 2H6");
  assert.equal(savedAct?.department, "");
});

test("selecting external manager and checking same_as_manager locks client_type to externe", () => {
  const managerTypeSelect = document.getElementById("form-activity-manager-type") as HTMLSelectElement;
  const sameCb = document.getElementById("form-activity-responsable-same-as-manager") as HTMLInputElement;
  const clientTypeSelect = document.getElementById("form-activity-client-type") as HTMLSelectElement;

  // Initially internal and unlocked
  clientTypeSelect.value = "interne";
  clientTypeSelect.disabled = false;

  // Set manager type to externe
  managerTypeSelect.value = "externe";
  managerTypeSelect.dispatchEvent(new Event("change"));

  // Client type should still be editable until sameCb is checked
  assert.equal(clientTypeSelect.disabled, false);

  // Check same_as_manager
  sameCb.checked = true;
  sameCb.dispatchEvent(new Event("change"));

  // Now client_type should be set to "externe", disabled, and styled as readonly
  assert.equal(clientTypeSelect.value, "externe");
  assert.equal(clientTypeSelect.disabled, true);
  assert.equal(clientTypeSelect.classList.contains("form-input-readonly"), true);

  // Changing manager type back to employe unlocks client_type
  managerTypeSelect.value = "employe";
  managerTypeSelect.dispatchEvent(new Event("change"));
  assert.equal(clientTypeSelect.disabled, false);
  assert.equal(clientTypeSelect.classList.contains("form-input-readonly"), false);

  // Changing manager type back to externe locks client_type again
  managerTypeSelect.value = "externe";
  managerTypeSelect.dispatchEvent(new Event("change"));
  assert.equal(clientTypeSelect.value, "externe");
  assert.equal(clientTypeSelect.disabled, true);
  assert.equal(clientTypeSelect.classList.contains("form-input-readonly"), true);

  // Unchecking same_as_manager unlocks client_type
  sameCb.checked = false;
  sameCb.dispatchEvent(new Event("change"));
  assert.equal(clientTypeSelect.disabled, false);
  assert.equal(clientTypeSelect.classList.contains("form-input-readonly"), false);
});

test("fillActivityFormFields locks client_type when loading activity with external manager and same_as_manager", () => {
  const activity = {
    ...appState.activities[0],
    client_type: "interne",
    responsable_same_as_manager: true,
    activity_manager: {
      first_name: "Paul",
      last_name: "Durand",
      type: "externe"
    }
  };

  fillActivityFormFields(activity);

  const clientTypeSelect = document.getElementById("form-activity-client-type") as HTMLSelectElement;
  assert.equal(clientTypeSelect.value, "externe");
  assert.equal(clientTypeSelect.disabled, true);
  assert.equal(clientTypeSelect.classList.contains("form-input-readonly"), true);
});

