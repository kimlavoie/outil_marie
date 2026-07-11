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

import { setAppState } from "../src/state/state.ts";
import { getActivityFormMode, switchActivityTab, updateFormTabIndicators } from "../src/activities/form-state-bar.ts";

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

test.beforeEach(() => {
  setAppState(baseState());
  (globalThis as any).localStorage.clear();
});

test("getActivityFormMode returns 'estimation' when no mode pill is active", () => {
  document.body.innerHTML = `<div id="activity-mode-toggle"></div>`;
  assert.equal(getActivityFormMode(), "estimation");
});

test("getActivityFormMode returns the active pill's data-mode", () => {
  document.body.innerHTML = `
    <div id="activity-mode-toggle">
      <button class="pill-toggle" data-mode="estimation"></button>
      <button class="pill-toggle active" data-mode="soumission"></button>
    </div>
  `;
  assert.equal(getActivityFormMode(), "soumission");
});

test("switchActivityTab activates the matching tab button and panel, deactivating the others", () => {
  document.body.innerHTML = `
    <button class="activity-tab-btn" data-activity-tab="form"></button>
    <button class="activity-tab-btn active" data-activity-tab="planning"></button>
    <div class="activity-tab-panel active" id="activity-tab-panel-planning"></div>
    <div class="activity-tab-panel" id="activity-tab-panel-form"></div>
    <div id="activity-drawer"></div>
  `;

  switchActivityTab("form");

  assert.equal(document.querySelector('[data-activity-tab="form"]')!.classList.contains("active"), true);
  assert.equal(document.querySelector('[data-activity-tab="planning"]')!.classList.contains("active"), false);
  assert.equal(document.getElementById("activity-tab-panel-form")!.classList.contains("active"), true);
  assert.equal(document.getElementById("activity-tab-panel-planning")!.classList.contains("active"), false);
});

test("switchActivityTab persists the open tab when the drawer is active", () => {
  document.body.innerHTML = `
    <button class="activity-tab-btn" data-activity-tab="billing"></button>
    <div class="activity-tab-panel" id="activity-tab-panel-billing"></div>
    <div id="activity-drawer" class="active"></div>
    <input id="form-activity-internal-id" value="act-42">
  `;

  switchActivityTab("billing");

  const persisted = JSON.parse((globalThis as any).localStorage.getItem("outil_marie_drawer_ui"));
  assert.deepEqual(persisted, { id: "act-42", tab: "billing" });
});

test("switchActivityTab does not persist anything when the drawer is closed", () => {
  document.body.innerHTML = `
    <button class="activity-tab-btn" data-activity-tab="billing"></button>
    <div class="activity-tab-panel" id="activity-tab-panel-billing"></div>
    <div id="activity-drawer"></div>
    <input id="form-activity-internal-id" value="act-42">
  `;

  switchActivityTab("billing");
  assert.equal((globalThis as any).localStorage.getItem("outil_marie_drawer_ui"), null);
});

function setupIndicators() {
  document.body.innerHTML = `
    <span id="tab-ind-form"></span>
    <span id="tab-ind-submission"></span>
    <span id="tab-ind-planning"></span>
    <span id="tab-ind-billing"></span>
    <span id="tab-ind-notes"></span>
  `;
}

test("updateFormTabIndicators marks the Formulaire tab green only when a form file is linked", () => {
  setupIndicators();
  updateFormTabIndicators({ form: {} });
  assert.equal(document.getElementById("tab-ind-form")!.innerHTML, "⚪");

  setupIndicators();
  updateFormTabIndicators({ form: { file_link_id: "file-1" } });
  assert.equal(document.getElementById("tab-ind-form")!.innerHTML, "🟢");
});

test("updateFormTabIndicators: Soumission indicator in estimation mode only needs a name and a reservation", () => {
  setupIndicators();
  updateFormTabIndicators({ mode: "estimation", name: "Activité", reservations: [{}] });
  assert.equal(document.getElementById("tab-ind-submission")!.innerHTML, "🟢");

  setupIndicators();
  updateFormTabIndicators({ mode: "estimation", name: "Activité", reservations: [] });
  assert.equal(document.getElementById("tab-ind-submission")!.innerHTML, "🟡");
});

test("updateFormTabIndicators: Soumission indicator in soumission mode additionally requires a manager name", () => {
  setupIndicators();
  updateFormTabIndicators({
    mode: "soumission",
    name: "Activité",
    reservations: [{}],
    activity_manager: { last_name: "Tremblay" }
  });
  assert.equal(document.getElementById("tab-ind-submission")!.innerHTML, "🟢");

  setupIndicators();
  updateFormTabIndicators({ mode: "soumission", name: "Activité", reservations: [{}], activity_manager: {} });
  assert.equal(document.getElementById("tab-ind-submission")!.innerHTML, "🟡");
});

test("updateFormTabIndicators: Planification indicator reflects task completion", () => {
  setupIndicators();
  updateFormTabIndicators({ planning_tasks: [] });
  assert.equal(document.getElementById("tab-ind-planning")!.innerHTML, "⚪");

  setupIndicators();
  updateFormTabIndicators({ planning_tasks: [{ done: true }, { done: false }] });
  assert.equal(document.getElementById("tab-ind-planning")!.innerHTML, "🟡");

  setupIndicators();
  updateFormTabIndicators({ planning_tasks: [{ done: true }, { done: true }] });
  assert.equal(document.getElementById("tab-ind-planning")!.innerHTML, "🟢");
});

test("updateFormTabIndicators: Facturation indicator prioritizes 'billed' over 'has distributions'", () => {
  setupIndicators();
  updateFormTabIndicators({ distributions: [] });
  assert.equal(document.getElementById("tab-ind-billing")!.innerHTML, "⚪");

  setupIndicators();
  updateFormTabIndicators({ distributions: [{ amount: 100 }] });
  assert.equal(document.getElementById("tab-ind-billing")!.innerHTML, "🟡");

  setupIndicators();
  updateFormTabIndicators({ distributions: [{ amount: 100 }], billed_at: "2025-08-01" });
  assert.equal(document.getElementById("tab-ind-billing")!.innerHTML, "🟢");
});

test("updateFormTabIndicators: Notes indicator shows only when notes are non-blank", () => {
  setupIndicators();
  updateFormTabIndicators({ notes: "   " });
  assert.equal(document.getElementById("tab-ind-notes")!.innerHTML, "");

  setupIndicators();
  updateFormTabIndicators({ notes: "Un rappel important" });
  assert.equal(document.getElementById("tab-ind-notes")!.innerHTML, "📝");
});

test("updateFormTabIndicators is a no-op given a null/undefined activity", () => {
  setupIndicators();
  assert.doesNotThrow(() => updateFormTabIndicators(null));
  assert.equal(document.getElementById("tab-ind-form")!.innerHTML, "");
});

export {};
