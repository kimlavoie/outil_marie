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
import { activitiesState } from "../src/activities/render.ts";
import {
  pushActivityUndoSnapshot,
  undoActivityFormChange,
  redoActivityFormChange
} from "../src/activities/history/index.ts";

function setupDom() {
  document.body.innerHTML = `
    <div id="activity-drawer"></div>
    <div id="drawer-backdrop"></div>
    <form id="activity-form"></form>
    <div id="activity-drawer-title"></div>
    <button id="activity-drawer-submit"></button>
    <button id="activity-drawer-back-to-calendar-btn"></button>
    <div id="form-activity-reservations"></div>
    <div id="form-distribution-list"></div>
    
    <input id="form-activity-internal-id" value="act-1" />
    <input id="form-activity-id" value="2025-001" />
    <input id="form-activity-name" value="Conférence" />
    <input id="form-activity-attendees" value="0" />
    <input id="form-activity-responsable-firstname" value="" />
    <input id="form-activity-responsable-lastname" value="" />
    <select id="form-activity-client-type"></select>
    <textarea id="form-activity-description"></textarea>
    <textarea id="form-activity-notes"></textarea>
    <input id="form-activity-coba" value="" />
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
    
    <!-- Tab Indicators -->
    <div id="tab-formulaire-indicator"></div>
    <div id="tab-soumission-indicator"></div>
    <div id="tab-planification-indicator"></div>
    <div id="tab-facturation-indicator"></div>
    <div id="tab-notes-indicator"></div>
    
    <!-- View lists for rendering update -->
    <div id="view-activities">
      <table>
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
    <div id="toast-container"></div>
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
        id: "act-1",
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
  activitiesState.undoStack = [];
  activitiesState.redoStack = [];
});

test("pushActivityUndoSnapshot records state and limits history size", () => {
  const act = { id: "act-1", name: "State 0" };
  pushActivityUndoSnapshot(act);
  
  assert.equal(activitiesState.undoStack.length, 1);
  assert.equal(activitiesState.undoStack[0].name, "State 0");
});

test("undo and redo activity form changes round-trip correctly", () => {
  const state0 = { id: "act-1", name: "Init Event", state: "brouillon", reservations: [], distributions: [], planning_tasks: [] };
  const state1 = { id: "act-1", name: "Updated Event", state: "brouillon", reservations: [], distributions: [], planning_tasks: [] };
  
  pushActivityUndoSnapshot(state0);
  pushActivityUndoSnapshot(state1);
  
  // Call undo
  undoActivityFormChange();
  
  assert.equal(activitiesState.undoStack.length, 1);
  assert.equal(activitiesState.redoStack.length, 1);
  assert.equal(appState.activities[0].name, "Init Event");
  
  // Call redo
  redoActivityFormChange();
  
  assert.equal(activitiesState.undoStack.length, 2);
  assert.equal(activitiesState.redoStack.length, 0);
  assert.equal(appState.activities[0].name, "Updated Event");
});
