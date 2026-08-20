import test from "node:test";
import assert from "node:assert/strict";
import "./indexeddb-mock.ts";
import { dom } from "./dom-mock.ts";

test.after(() => dom.window.close());

import { appState, setAppState } from "../src/state/state.ts";
import { activitiesState } from "../src/activities/render.ts";
import { updateBulkActionsBar, initBulkActionsHandlers } from "../src/activities/bulk-actions.ts";

function flush(ms = 100): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function baseSettings() {
  return {
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
  };
}

function setupFixture() {
  document.body.innerHTML = `
    <div id="bulk-actions-bar"></div>
    <span id="bulk-selected-count"></span>
    <input type="checkbox" id="activities-select-all">
    <div id="toast-container"></div>
    <table>
      <tbody>
        <tr data-id="act-1"><td><input type="checkbox" class="activity-select-checkbox" data-id="act-1"></td></tr>
        <tr data-id="act-2"><td><input type="checkbox" class="activity-select-checkbox" data-id="act-2"></td></tr>
        <tr data-id="act-3"><td><input type="checkbox" class="activity-select-checkbox" data-id="act-3"></td></tr>
      </tbody>
    </table>
    <button id="bulk-clear-btn"></button>
    <button id="bulk-delete-btn"></button>
    <button id="bulk-state-btn"></button>
    <div id="bulk-state-menu" class="hidden">
      <div class="bulk-state-item" data-state="confirme"></div>
    </div>
  `;
  activitiesState.selectedIds = new Set();
}

test("smoke: modules import and bar updates", () => {
  document.body.innerHTML = `
    <div id="bulk-actions-bar"></div>
    <span id="bulk-selected-count"></span>
    <input type="checkbox" id="activities-select-all">
  `;
  activitiesState.selectedIds = new Set(["a", "b"]);
  updateBulkActionsBar();
  assert.equal(document.getElementById("bulk-selected-count")!.textContent, "2 activités sélectionnées");
  assert.ok(document.getElementById("bulk-actions-bar")!.classList.contains("visible"));
});

test("select-all checkbox selects/deselects every visible row and syncs activitiesState.selectedIds", () => {
  setupFixture();
  initBulkActionsHandlers();

  const selectAll = document.getElementById("activities-select-all") as HTMLInputElement;
  selectAll.checked = true;
  selectAll.dispatchEvent(new Event("change"));

  assert.deepEqual([...activitiesState.selectedIds].sort(), ["act-1", "act-2", "act-3"]);
  document.querySelectorAll(".activity-select-checkbox").forEach(cb => assert.ok((cb as HTMLInputElement).checked));
  document.querySelectorAll("tr").forEach(tr => assert.ok(tr.classList.contains("selected")));

  selectAll.checked = false;
  selectAll.dispatchEvent(new Event("change"));

  assert.equal(activitiesState.selectedIds.size, 0);
  document.querySelectorAll("tr").forEach(tr => assert.equal(tr.classList.contains("selected"), false));
});

test("bulk-clear-btn clears the selection without touching appState", () => {
  setupFixture();
  setAppState({ settings: baseSettings(), activities: [{ id: "act-1", deleted: false }] as any, favorites: [], selected_year: "", selected_quarters: [1, 2, 3, 4] });
  initBulkActionsHandlers();
  activitiesState.selectedIds = new Set(["act-1"]);

  document.getElementById("bulk-clear-btn")!.dispatchEvent(new Event("click"));

  assert.equal(activitiesState.selectedIds.size, 0);
  assert.equal(appState.activities[0].deleted, false);
});

test("bulk delete: marks only the selected activities deleted, drops them from favorites, and clears the selection", async () => {
  setupFixture();
  setAppState({
    settings: baseSettings(),
    activities: [
      { id: "act-1", deleted: false },
      { id: "act-2", deleted: false },
      { id: "act-3", deleted: false }
    ] as any,
    favorites: ["act-1", "act-3"],
    selected_year: "",
    selected_quarters: [1, 2, 3, 4]
  });
  activitiesState.selectedIds = new Set(["act-1", "act-2"]);
  (globalThis as any).confirm = () => true;
  initBulkActionsHandlers();

  document.getElementById("bulk-delete-btn")!.dispatchEvent(new Event("click"));
  await flush();

  assert.equal(appState.activities.find(a => a.id === "act-1")!.deleted, true);
  assert.equal(appState.activities.find(a => a.id === "act-2")!.deleted, true);
  assert.equal(appState.activities.find(a => a.id === "act-3")!.deleted, false);
  assert.deepEqual(appState.favorites, ["act-3"]);
  assert.equal(activitiesState.selectedIds.size, 0);
});

test("bulk delete: a cancelled confirmation leaves every activity and the selection untouched", async () => {
  setupFixture();
  setAppState({
    settings: baseSettings(),
    activities: [{ id: "act-1", deleted: false }] as any,
    favorites: [],
    selected_year: "",
    selected_quarters: [1, 2, 3, 4]
  });
  activitiesState.selectedIds = new Set(["act-1"]);
  (globalThis as any).confirm = () => false;
  initBulkActionsHandlers();

  document.getElementById("bulk-delete-btn")!.dispatchEvent(new Event("click"));
  await flush();

  assert.equal(appState.activities[0].deleted, false);
  assert.equal(activitiesState.selectedIds.size, 1);
});

test("bulk delete: an empty selection is a no-op that doesn't even prompt for confirmation", async () => {
  setupFixture();
  setAppState({ settings: baseSettings(), activities: [{ id: "act-1", deleted: false }] as any, favorites: [], selected_year: "", selected_quarters: [1, 2, 3, 4] });
  activitiesState.selectedIds = new Set();
  let confirmCalled = false;
  (globalThis as any).confirm = () => {
    confirmCalled = true;
    return true;
  };
  initBulkActionsHandlers();

  document.getElementById("bulk-delete-btn")!.dispatchEvent(new Event("click"));
  await flush();

  assert.equal(confirmCalled, false);
  assert.equal(appState.activities[0].deleted, false);
});

test("bulk delete rolls back the in-memory deletion (and favorites change) when persistence fails", async () => {
  setupFixture();
  setAppState({
    settings: baseSettings(),
    activities: [{ id: "act-1", deleted: false }] as any,
    favorites: ["act-1"],
    selected_year: "",
    selected_quarters: [1, 2, 3, 4]
  });
  activitiesState.selectedIds = new Set(["act-1"]);
  (globalThis as any).confirm = () => true;
  initBulkActionsHandlers();

  const originalOpen = (globalThis as any).indexedDB.open;
  (globalThis as any).indexedDB.open = () => {
    const req: any = { onsuccess: null, onerror: null, onupgradeneeded: null };
    setTimeout(() => {
      req.error = new Error("quota dépassé");
      if (req.onerror) req.onerror();
    }, 0);
    return req;
  };

  try {
    document.getElementById("bulk-delete-btn")!.dispatchEvent(new Event("click"));
    await flush();
  } finally {
    (globalThis as any).indexedDB.open = originalOpen;
  }

  assert.equal(appState.activities[0].deleted, false, "the deletion must be rolled back when the save fails");
  assert.deepEqual(appState.favorites, ["act-1"], "favorites must also be rolled back");
  // saveDatabase() itself shows a generic save-failure toast; bulk-actions.ts shows a second,
  // more specific one once it rolls back its own in-memory change.
  const toasts = [...document.querySelectorAll("#toast-container .toast-message")].map(t => t.textContent);
  assert.ok(toasts.some(t => t && /n'a pas été enregistrée/.test(t)), `expected a rollback toast, got: ${toasts.join(" | ")}`);
});

test("bulk state change: sets the new state on every selected activity, clears the selection, and hides the dropdown", async () => {
  setupFixture();
  setAppState({
    settings: baseSettings(),
    activities: [
      { id: "act-1", state: "brouillon" },
      { id: "act-2", state: "brouillon" },
      { id: "act-3", state: "brouillon" }
    ] as any,
    favorites: [],
    selected_year: "",
    selected_quarters: [1, 2, 3, 4]
  });
  activitiesState.selectedIds = new Set(["act-1", "act-3"]);
  document.getElementById("bulk-state-menu")!.classList.remove("hidden");
  initBulkActionsHandlers();

  document.querySelector(".bulk-state-item[data-state='confirme']")!.dispatchEvent(new Event("click"));
  await flush();

  assert.equal(appState.activities.find(a => a.id === "act-1")!.state, "confirme");
  assert.equal(appState.activities.find(a => a.id === "act-2")!.state, "brouillon");
  assert.equal(appState.activities.find(a => a.id === "act-3")!.state, "confirme");
  assert.equal(activitiesState.selectedIds.size, 0);
  assert.ok(document.getElementById("bulk-state-menu")!.classList.contains("hidden"));
});
export {};
