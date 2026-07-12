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
import { showActivityContextMenu, closeActivityContextMenu } from "../src/activities/context-menu.ts";

function setupDom() {
  document.body.innerHTML = `
    <div id="view-activities">
      <tbody id="activities-list-body"></tbody>
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
  (globalThis as any).confirm = () => true;
  (globalThis as any).window.innerWidth = 1024;
  (globalThis as any).window.innerHeight = 768;
});

test("showActivityContextMenu creates menu and positions it", () => {
  const e = { clientX: 100, clientY: 200 } as MouseEvent;
  showActivityContextMenu(e, "act-1");
  
  const menu = document.getElementById("activity-context-menu")!;
  assert.ok(menu);
  assert.equal(menu.style.left, "100px");
  assert.equal(menu.style.top, "200px");
  
  const items = menu.querySelectorAll("button");
  assert.ok(items.length > 2);
  assert.equal(items[items.length - 1].textContent, "Supprimer");
});

test("clicking delete in menu triggers confirmation and marks activity deleted", async () => {
  const e = { clientX: 100, clientY: 200 } as MouseEvent;
  showActivityContextMenu(e, "act-1");
  
  const menu = document.getElementById("activity-context-menu")!;
  const deleteBtn = Array.from(menu.querySelectorAll("button")).find(b => b.textContent === "Supprimer")!;
  
  deleteBtn.click();
  
  const deletedAct = appState.activities.find(a => a.id === "act-1");
  assert.ok(deletedAct?.deleted);
  
  // Context menu should be closed/removed
  assert.equal(document.getElementById("activity-context-menu"), null);
});
