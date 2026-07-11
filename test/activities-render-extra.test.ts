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
import { activitiesState, renderActivities } from "../src/activities/render.ts";

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

function makeActivity(overrides: any = {}) {
  return {
    id: "A1",
    name: "",
    responsable: "",
    distributions: [] as any[],
    reservations: [] as any[],
    client_type: "interne",
    state: "brouillon",
    date_start: "",
    date_end: "",
    deleted: false,
    coba: "",
    ...overrides
  };
}

function setupFixture() {
  document.body.innerHTML = `
    <input id="activity-search" value="">
    <div id="filter-salle-panel"></div>
    <div id="filter-client-type-panel"></div>
    <div id="filter-status-panel"></div>
    <button id="reset-filters-btn"></button>
    <table><tbody id="activities-table-body"></tbody></table>
    <div id="activities-pagination"></div>
    <div id="bulk-actions-bar"></div>
    <span id="bulk-selected-count"></span>
    <input type="checkbox" id="activities-select-all">
  `;
  activitiesState.selectedIds = new Set();
  activitiesState.sortKey = "id";
  activitiesState.sortOrder = "asc";
  activitiesState.page = 1;
  activitiesState.pageSize = 10;
}

function rowIds(): string[] {
  return [...document.querySelectorAll(".activity-row")].map(r => r.getAttribute("data-id")!);
}

test.beforeEach(() => setupFixture());

test("renderActivities shows the 'no activity' placeholder and a disabled reset button when nothing matches", () => {
  setAppState(baseState({ activities: [] }));
  renderActivities();

  assert.match(document.getElementById("activities-table-body")!.innerHTML, /Aucune activité trouvée/);
  assert.equal((document.getElementById("reset-filters-btn") as HTMLButtonElement).disabled, true);
});

test("renderActivities excludes deleted activities and shows 'Vierge' for a blank-name row", () => {
  setAppState(
    baseState({
      activities: [makeActivity({ id: "A1", name: "", deleted: false }), makeActivity({ id: "A2", name: "Gala", deleted: true })]
    })
  );
  renderActivities();

  assert.deepEqual(rowIds(), ["A1"]);
  const row = document.querySelector(".activity-row[data-id='A1']")!;
  assert.ok(row.classList.contains("row-empty"));
  assert.match(row.innerHTML, /Vierge/);
});

test("renderActivities' search filter matches id, name, responsable, account code and reference", () => {
  const acts = [
    makeActivity({ id: "A1", name: "Gala annuel" }),
    makeActivity({ id: "A2", name: "Souper" }),
    makeActivity({ id: "A3", name: "Conférence", responsable: "Tremblay" }),
    makeActivity({ id: "A4", name: "Atelier", distributions: [{ account_code: "892-1111-00-000", amount: 100, reference: "RI-77" }] })
  ];
  setAppState(baseState({ activities: acts }));

  (document.getElementById("activity-search") as HTMLInputElement).value = "gala";
  renderActivities();
  assert.deepEqual(rowIds(), ["A1"]);
  assert.equal((document.getElementById("reset-filters-btn") as HTMLButtonElement).disabled, false);

  (document.getElementById("activity-search") as HTMLInputElement).value = "tremblay";
  renderActivities();
  assert.deepEqual(rowIds(), ["A3"]);

  (document.getElementById("activity-search") as HTMLInputElement).value = "ri-77";
  renderActivities();
  assert.deepEqual(rowIds(), ["A4"]);

  (document.getElementById("activity-search") as HTMLInputElement).value = "892-1111";
  renderActivities();
  assert.deepEqual(rowIds(), ["A4"]);
});

test("renderActivities' salle filter only keeps activities booked in a checked room", () => {
  const acts = [
    makeActivity({ id: "A1", reservations: [{ room_name: "Salle A" }] }),
    makeActivity({ id: "A2", reservations: [{ room_name: "Salle B" }] }),
    makeActivity({ id: "A3", reservations: [] })
  ];
  setAppState(baseState({ activities: acts }));
  document.getElementById("filter-salle-panel")!.innerHTML = `<input type="checkbox" value="Salle A" checked>`;

  renderActivities();

  assert.deepEqual(rowIds(), ["A1"]);
});

test("renderActivities' client-type filter only keeps matching activities", () => {
  const acts = [makeActivity({ id: "A1", client_type: "interne" }), makeActivity({ id: "A2", client_type: "externe" })];
  setAppState(baseState({ activities: acts }));
  document.getElementById("filter-client-type-panel")!.innerHTML = `<input type="checkbox" value="externe" checked>`;

  renderActivities();

  assert.deepEqual(rowIds(), ["A2"]);
});

test("renderActivities' status filter only keeps matching activities", () => {
  const acts = [makeActivity({ id: "A1", state: "brouillon" }), makeActivity({ id: "A2", state: "facturee" })];
  setAppState(baseState({ activities: acts }));
  document.getElementById("filter-status-panel")!.innerHTML = `<input type="checkbox" value="facturee" checked>`;

  renderActivities();

  assert.deepEqual(rowIds(), ["A2"]);
});

test("renderActivities' period filter keeps undated activities, and filters dated ones by the selected fiscal year/quarter", () => {
  const acts = [
    makeActivity({ id: "A1", date_start: "" }), // always shown regardless of period
    makeActivity({ id: "A2", date_start: "2025-08-01" }), // FY 2025-2026, Q1 -> matches
    makeActivity({ id: "A3", date_start: "2024-08-01" }) // FY 2024-2025 -> does not match
  ];
  setAppState(baseState({ activities: acts, selected_year: "2025-2026", selected_quarters: [1, 2, 3, 4] }));

  renderActivities();
  assert.deepEqual(rowIds().sort(), ["A1", "A2"]);
});

test("renderActivities sorts by name and by total revenue, in both directions", () => {
  const acts = [
    makeActivity({ id: "A1", name: "Zèbre", distributions: [{ account_code: "1", amount: 50, reference: "" }] }),
    makeActivity({ id: "A2", name: "Alpha", distributions: [{ account_code: "1", amount: 200, reference: "" }] })
  ];
  setAppState(baseState({ activities: acts }));

  activitiesState.sortKey = "name";
  activitiesState.sortOrder = "asc";
  renderActivities();
  assert.deepEqual(rowIds(), ["A2", "A1"]);

  activitiesState.sortOrder = "desc";
  renderActivities();
  assert.deepEqual(rowIds(), ["A1", "A2"]);

  activitiesState.sortKey = "totalRev";
  activitiesState.sortOrder = "asc";
  renderActivities();
  assert.deepEqual(rowIds(), ["A1", "A2"]);
});

test("renderActivities' checkbox toggling updates activitiesState.selectedIds and the row's 'selected' class", () => {
  setAppState(baseState({ activities: [makeActivity({ id: "A1", name: "Gala" })] }));
  renderActivities();

  const checkbox = document.querySelector<HTMLInputElement>(".activity-select-checkbox[data-id='A1']")!;
  checkbox.checked = true;
  checkbox.dispatchEvent(new Event("change"));

  assert.ok(activitiesState.selectedIds.has("A1"));
  assert.ok(document.querySelector(".activity-row[data-id='A1']")!.classList.contains("selected"));

  checkbox.checked = false;
  checkbox.dispatchEvent(new Event("change"));

  assert.equal(activitiesState.selectedIds.has("A1"), false);
  assert.equal(document.querySelector(".activity-row[data-id='A1']")!.classList.contains("selected"), false);
});
export {};
