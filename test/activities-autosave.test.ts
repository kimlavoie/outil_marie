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
  showAutoSaveStatus,
  autoSaveActivityForm,
  setActivityUndoSnapshotTimer
} from "../src/activities/autosave.ts";

function setupDom() {
  document.body.innerHTML = `
    <input id="form-activity-internal-id" value="act-1" />
    <input id="form-activity-id" value="2025-001" />
    <input id="form-activity-name" value="Conférence de Presse" />
    <input id="form-activity-attendees" value="50" />
    <input type="checkbox" id="form-activity-responsable-same-as-manager" />
    <input id="form-activity-responsable-firstname" value="Jean" />
    <input id="form-activity-responsable-lastname" value="Dupont" />
    <select id="form-activity-client-type">
      <option value="interne">Interne</option>
    </select>
    <textarea id="form-activity-description">Description test</textarea>
    <textarea id="form-activity-notes">Notes test</textarea>
    <input id="form-activity-coba" value="COBA-123" />
    <input id="form-activity-manager-firstname" value="Marie" />
    <input id="form-activity-manager-lastname" value="Tremblay" />
    <select id="form-activity-manager-type">
      <option value="employe">Employé</option>
    </select>
    <input id="form-activity-manager-phone" value="514-555-5555" />
    <input id="form-activity-manager-email" value="marie@example.com" />
    <input id="form-activity-manager-company" value="Cie" />
    <input id="form-activity-manager-coba-client-number" value="123" />
    <input id="form-activity-manager-address" value="Rue" />
    <input id="form-activity-manager-city" value="Montréal" />
    <input id="form-activity-manager-province" value="QC" />
    <input id="form-activity-manager-postal-code" value="H1H 1H1" />
    <select id="form-activity-dept">
      <option value="ACEECJ">ACEECJ</option>
    </select>
    <select id="form-activity-event-type">
      <option value="conference">Conférence</option>
    </select>
    <input id="form-activity-event-type-other" value="" />

    <div id="auto-save-status">
      <span class="auto-save-spinner"></span>
      <span class="auto-save-text"></span>
    </div>

    <div id="form-distribution-list"></div>
    <div id="form-activity-reservations"></div>
    
    <!-- Toast & list placeholders -->
    <div id="toast-container"></div>
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
  setActivityUndoSnapshotTimer(null);
});

test("showAutoSaveStatus updates status classes and texts", () => {
  showAutoSaveStatus("saving");
  
  const statusEl = document.getElementById("auto-save-status")!;
  assert.ok(statusEl.className.includes("saving"));
  
  const textEl = statusEl.querySelector<HTMLElement>(".auto-save-text")!;
  assert.equal(textEl.textContent, "Enregistrement...");
  
  showAutoSaveStatus("saved");
  assert.ok(statusEl.className.includes("saved"));
  assert.equal(textEl.textContent, "Enregistré");
});

test("autoSaveActivityForm gathers inputs and updates state", () => {
  autoSaveActivityForm();
  
  const act = appState.activities.find(a => a.id === "2025-001")!;
  assert.ok(act);
  assert.equal(act.name, "Conférence de Presse");
  assert.equal(act.attendees_count, 50);
  assert.equal(act.responsable, "Jean Dupont");
  assert.equal(act.coba, "COBA-123");
});
