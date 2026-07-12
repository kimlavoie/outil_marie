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

import { setAppState, appState } from "../src/state/state.ts";
import {
  initNewActivityModal,
  openNewActivityModal,
  closeNewActivityModal,
  createActivity,
  createDraftActivity,
  duplicateActivityAndOpen
} from "../src/activities/new-activity-modal.ts";

function setupDom() {
  document.body.innerHTML = `
    <button id="new-activity-modal-close"></button>
    <button id="new-activity-modal-cancel"></button>
    <button id="new-activity-modal-submit"></button>
    <form id="new-activity-form">
      <input id="form-new-activity-name" value="" />
    </form>
    <div id="new-activity-modal-title"></div>
    <div id="new-activity-modal"></div>
    <div id="modal-backdrop"></div>
    
    <!-- Drawer / general elements -->
    <div id="activity-drawer"></div>
    <div id="drawer-backdrop"></div>
    <form id="activity-form">
      <input id="form-activity-id" />
      <input id="form-activity-coba" />
    </form>
    <div id="activity-drawer-title"></div>
    <button id="activity-drawer-submit"></button>
    <button id="activity-drawer-back-to-calendar-btn"></button>
    <div id="form-distribution-total-val"></div>
    <div id="form-activity-reservations"></div>
    <div id="form-distribution-list"></div>
    <input id="form-activity-internal-id" value="" />
    <input id="form-activity-name" value="" />
    <input id="form-activity-attendees" value="" />
    <input id="form-activity-responsable-firstname" value="" />
    <input id="form-activity-responsable-lastname" value="" />
    <select id="form-activity-client-type"></select>
    <textarea id="form-activity-description"></textarea>
    <textarea id="form-activity-notes"></textarea>
    <input id="form-activity-manager-firstname" value="" />
    <input id="form-activity-manager-lastname" value="" />
    <select id="form-activity-manager-type"></select>
    <input id="form-activity-manager-phone" value="" />
    <input id="form-activity-manager-email" value="" />
    <input id="form-activity-manager-company" value="" />
    <input id="form-activity-manager-coba-client-number" value="" />
    <input id="form-activity-manager-address" value="" />
    <input id="form-activity-manager-city" value="" />
    <input id="form-activity-manager-province" value="" />
    <input id="form-activity-manager-postal-code" value="" />
    <div id="form-activity-manager-external-group"></div>
    <select id="form-activity-dept"></select>
    <select id="form-activity-event-type"></select>
    <input id="form-activity-event-type-other" value="" />
    <div id="form-activity-event-type-other-group"></div>
    
    <!-- State bar markers -->
    <div id="activity-state-bar"></div>
    <div id="drawer-state-badge"></div>
    <div id="drawer-progress-bar-container"></div>
    <div id="drawer-state-transition-btn"></div>
    
    <!-- Toggle mode & Tab panels -->
    <div id="activity-mode-toggle">
      <button class="pill-toggle" data-mode="estimation"></button>
      <button class="pill-toggle" data-mode="soumission"></button>
    </div>
    <div id="activity-tab-panel-submission"></div>
    <div id="activity-mode-group"></div>
    <div id="planning-tasks-list"></div>
    <button id="generate-planning-tasks-btn"></button>
    <div id="planning-progress-bar-container"></div>
    <div id="planning-progress-label"></div>
    
    <div id="view-activities">
      <table>
        <thead>
          <tr><th data-sort="name">Nom</th></tr>
        </thead>
        <tbody id="activities-table-body"></tbody>
      </table>
      <input id="activity-search" value="" />
      <div id="filter-salle-panel"></div>
      <div id="filter-client-type-panel"></div>
      <div id="filter-status-panel"></div>
      <button id="reset-filters-btn"></button>
      <div id="activities-empty-placeholder"></div>
      <button id="activities-reset-filters-btn"></button>
    </div>
    
    <!-- Tab Indicators -->
    <div id="tab-formulaire-indicator"></div>
    <div id="tab-soumission-indicator"></div>
    <div id="tab-planification-indicator"></div>
    <div id="tab-facturation-indicator"></div>
    <div id="tab-notes-indicator"></div>
  `;
}

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
    activities: [
      {
        id: "2025-001",
        name: "Conférence",
        responsable: "",
        attendees_count: 0,
        reservations: [],
        distributions: [],
        state: "brouillon",
        mode: "soumission",
        submission: { file_link_id: "", generated_at: "", sent_at: "" },
        contract: { file_link_id: "", approved_at: "" },
        form: { file_link_id: "", linked_at: "" },
        planning_tasks: []
      }
    ],
    favorites: [],
    selected_year: "2025-2026",
    selected_quarters: [1, 2, 3, 4],
    ...overrides
  };
}

test.beforeEach(() => {
  setAppState(baseState());
  setupDom();
  document.body.innerHTML += `<div id="toast-container"></div>`;
});

test("openNewActivityModal opens modal and sets title", () => {
  openNewActivityModal("estimation");
  
  const modal = document.getElementById("new-activity-modal")!;
  assert.ok(modal.classList.contains("active"));
  
  const title = document.getElementById("new-activity-modal-title")!;
  assert.equal(title.textContent, "Nouvelle estimation");
});

test("closeNewActivityModal closes modal", () => {
  openNewActivityModal("soumission");
  closeNewActivityModal();
  
  const modal = document.getElementById("new-activity-modal")!;
  assert.ok(!modal.classList.contains("active"));
});

test("createActivity adds a persisted activity", () => {
  const id = createActivity("Activité Spéciale", "soumission");
  
  assert.ok(id);
  const act = appState.activities.find(a => a.id === id);
  assert.ok(act);
  assert.equal(act.name, "Activité Spéciale");
  assert.equal(act.mode, "soumission");
});

test("createDraftActivity adds a draft activity", () => {
  const id = createDraftActivity("Draft Event");
  
  assert.ok(id);
  const act = appState.activities.find(a => a.id === id);
  assert.ok(act);
  assert.equal(act.name, "Draft Event");
  assert.equal(act.mode, "estimation");
});

test("duplicateActivityAndOpen clones an activity under a fresh id", () => {
  duplicateActivityAndOpen("2025-001");
  
  assert.equal(appState.activities.length, 2);
  const clone = appState.activities[1];
  assert.notEqual(clone.id, "2025-001");
  assert.equal(clone.name, "Conférence");
  assert.equal(clone.state, "brouillon");
});

test("initNewActivityModal wires click/submit handlers", () => {
  initNewActivityModal();
  
  openNewActivityModal("soumission");
  const input = document.getElementById("form-new-activity-name") as HTMLInputElement;
  input.value = "Nouveau via submit";
  
  const submitBtn = document.getElementById("new-activity-modal-submit")!;
  submitBtn.click();
  
  assert.equal(appState.activities.length, 2);
  assert.equal(appState.activities[1].name, "Nouveau via submit");
});
