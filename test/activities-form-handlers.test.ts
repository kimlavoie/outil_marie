import test from "node:test";
import assert from "node:assert/strict";
import "./indexeddb-mock.ts";
import { dom } from "./dom-mock.ts";

test.after(() => dom.window.close());

(globalThis as any).localStorage = {
  store: {} as Record<string, string>,
  getItem(key: string) {
    return this.store[key] || null;
  },
  setItem(key: string, value: string) {
    this.store[key] = String(value);
  },
  removeItem(key: string) {
    delete this.store[key];
  },
  clear() {
    this.store = {};
  }
};

import { setAppState } from "../src/state/state.ts";
import { activitiesState } from "../src/activities/render.ts";
import { initFormHandlers } from "../src/activities/form.ts";

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
    selected_year: "2025-2026",
    selected_quarters: [1, 2, 3, 4],
    ...overrides
  };
}

// Every element initFormHandlers() (and the subsystems it wires: initBulkActionsHandlers,
// initActivityModeToggle, initReservationsSection, initMultiSelectDropdown) touches without a
// null-guard. Missing any of these makes initFormHandlers() itself throw.
function setupFixture() {
  document.body.innerHTML = `
    <div id="drawer-backdrop"></div>
    <div id="activity-drawer"></div>
    <button id="add-activity-btn-quick"></button>
    <button id="add-estimation-btn-quick"></button>
    <button id="activity-drawer-close"></button>
    <button id="activity-print-btn"></button>
    <button id="activity-drawer-back-to-calendar-btn"></button>
    <button id="form-add-distribution-btn"></button>
    <div id="form-activity-reservations"></div>
    <button id="generate-planning-tasks-btn"></button>
    <button id="add-planning-task-btn"></button>
    <button id="generate-billing-lines-btn"></button>
    <div id="activity-mode-toggle"></div>

    <select id="form-activity-manager-type">
      <option value="employe">Employé</option>
      <option value="externe">Externe</option>
    </select>
    <div id="form-activity-manager-external-group"></div>

    <select id="form-activity-event-type">
      <option value=""></option>
      <option value="conference">Conférence</option>
      <option value="autre">Autre</option>
    </select>
    <div id="form-activity-event-type-other-group"></div>

    <input id="activity-search" value="">
    <div id="filter-salle-panel"><input type="checkbox" value="Salle A" checked></div>
    <div id="filter-client-type-panel"></div>
    <div id="filter-status-panel"></div>
    <button id="reset-filters-btn"></button>
    <table><tbody id="activities-table-body"></tbody></table>
    <div id="activities-pagination"></div>
    <div id="bulk-actions-bar"></div>
    <span id="bulk-selected-count"></span>
    <input type="checkbox" id="activities-select-all">

    <nav>
      <div class="nav-item" data-view="dashboard"><button></button></div>
      <div class="nav-item" data-view="activities"><button></button></div>
      <div class="nav-item" data-view="validation"><button></button></div>
      <div class="nav-item" data-view="account-report"><button></button></div>
      <div class="nav-item" data-view="settings"><button></button></div>
      <div class="nav-item" data-view="backup"><button></button></div>
    </nav>
  `;
  activitiesState.selectedIds = new Set();
  activitiesState.page = 1;
}

test.beforeEach(() => {
  setAppState(baseState());
  setupFixture();
});

test("initFormHandlers wires up without throwing given the required DOM elements", () => {
  assert.doesNotThrow(() => initFormHandlers());
});

test("reset-filters-btn clears the search box and every filter panel, then re-renders the (now unfiltered) list", () => {
  setAppState(baseState({ activities: [{ id: "A1", name: "Gala", responsable: "", distributions: [], reservations: [], client_type: "interne", state: "brouillon", date_start: "", date_end: "", deleted: false, coba: "" }] }));
  setupFixture();
  (document.getElementById("activity-search") as HTMLInputElement).value = "quelquechose";
  initFormHandlers();

  document.getElementById("reset-filters-btn")!.dispatchEvent(new Event("click"));

  assert.equal((document.getElementById("activity-search") as HTMLInputElement).value, "");
  assert.equal((document.querySelector("#filter-salle-panel input") as HTMLInputElement).checked, false);
  // The list was re-rendered with the (now-cleared) filters: the fixture's one activity shows up.
  assert.ok(document.querySelector(".activity-row[data-id='A1']"));
});

test("Alt+2 delegates to the 'activities' nav item's button (Alt+[1-6] tab-switch shortcut)", () => {
  initFormHandlers();

  let clicked = false;
  document.querySelector('.nav-item[data-view="activities"] button')!.addEventListener("click", () => {
    clicked = true;
  });

  window.dispatchEvent(new (window as any).KeyboardEvent("keydown", { key: "2", altKey: true }));

  assert.equal(clicked, true);
});

test("changing 'form-activity-manager-type' to 'externe' reveals the external-manager fields", () => {
  initFormHandlers();
  const select = document.getElementById("form-activity-manager-type") as HTMLSelectElement;
  const externalGroup = document.getElementById("form-activity-manager-external-group")!;

  select.value = "externe";
  select.dispatchEvent(new Event("change"));
  assert.equal((externalGroup as HTMLElement).style.display, "block");

  select.value = "employe";
  select.dispatchEvent(new Event("change"));
  assert.equal((externalGroup as HTMLElement).style.display, "none");
});

test("changing 'form-activity-event-type' to 'autre' reveals the free-text 'other' field", () => {
  initFormHandlers();
  const select = document.getElementById("form-activity-event-type") as HTMLSelectElement;
  const otherGroup = document.getElementById("form-activity-event-type-other-group")!;

  select.value = "autre";
  select.dispatchEvent(new Event("change"));
  assert.equal((otherGroup as HTMLElement).style.display, "flex");

  select.value = "conference";
  select.dispatchEvent(new Event("change"));
  assert.equal((otherGroup as HTMLElement).style.display, "none");
});
export {};
