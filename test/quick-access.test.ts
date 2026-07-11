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

import { setAppState, appState, formatDateStrLocal, recordActivityView } from "../src/state/state.ts";
import { initQuickAccessDropdown, closeQuickAccessDropdown, renderQuickAccessAll } from "../src/navigation/quick-access.ts";

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
    selected_year: "",
    selected_quarters: [1, 2, 3, 4],
    ...overrides
  };
}

function makeActivity(overrides: any = {}) {
  return {
    id: "A1",
    name: "Gala annuel",
    responsable: "",
    distributions: [],
    reservations: [],
    client_type: "interne",
    state: "brouillon",
    deleted: false,
    date_start: "",
    ...overrides
  };
}

function daysFromToday(offset: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return formatDateStrLocal(d);
}

function setupFixture() {
  document.body.innerHTML = `
    <button id="quick-access-toggle-btn"></button>
    <div id="quick-access-dropdown-panel"></div>
    <div id="quick-access-list-global"></div>
    <span id="quick-access-count-badge"></span>
  `;
  (globalThis as any).localStorage.clear();
}

test.beforeEach(() => {
  setAppState(baseState());
  setupFixture();
});

test("renderQuickAccessAll shows the empty-state message and a hidden badge with nothing pinned/recent/upcoming", () => {
  setAppState(baseState({ activities: [makeActivity()] }));
  renderQuickAccessAll();

  const list = document.getElementById("quick-access-list-global")!;
  assert.match(list.innerHTML, /Aucune activité épinglée/);
  assert.equal(document.getElementById("quick-access-count-badge")!.style.display, "none");
});

test("renderQuickAccessAll lists pinned favorites under 'Épinglées' with an unpin button", () => {
  setAppState(baseState({ activities: [makeActivity({ id: "A1", name: "Gala annuel" })], favorites: ["A1"] }));
  renderQuickAccessAll();

  const list = document.getElementById("quick-access-list-global")!;
  const item = list.querySelector(".quick-access-item[data-id='A1']")!;
  assert.ok(item);
  assert.match(item.innerHTML, /Gala annuel/);
  assert.ok(item.querySelector(".remove-quick-access-btn"));
  assert.equal(item.querySelector(".pin-quick-access-btn"), null);
  assert.equal(document.getElementById("quick-access-count-badge")!.textContent, "1");
  assert.equal(document.getElementById("quick-access-count-badge")!.style.display, "inline-flex");
});

test("renderQuickAccessAll lists activities starting within the next 30 days under 'À venir bientôt', excluding those outside the window", () => {
  setAppState(
    baseState({
      activities: [
        makeActivity({ id: "SOON", name: "Bientôt", date_start: daysFromToday(5) }),
        makeActivity({ id: "TODAY", name: "Aujourd'hui", date_start: daysFromToday(0) }),
        makeActivity({ id: "FAR", name: "Trop loin", date_start: daysFromToday(31) }),
        makeActivity({ id: "PAST", name: "Passée", date_start: daysFromToday(-1) })
      ]
    })
  );
  renderQuickAccessAll();

  const list = document.getElementById("quick-access-list-global")!;
  assert.ok(list.querySelector(".quick-access-item[data-id='SOON']"));
  assert.ok(list.querySelector(".quick-access-item[data-id='TODAY']"));
  assert.equal(list.querySelector(".quick-access-item[data-id='FAR']"), null);
  assert.equal(list.querySelector(".quick-access-item[data-id='PAST']"), null);
});

test("renderQuickAccessAll de-duplicates an activity that is both favorite and recently viewed, keeping only the higher-priority 'favorite' section", () => {
  setAppState(baseState({ activities: [makeActivity({ id: "A1", name: "Gala annuel" })], favorites: ["A1"] }));
  recordActivityView("A1");

  renderQuickAccessAll();

  const list = document.getElementById("quick-access-list-global")!;
  assert.equal(list.querySelectorAll(".quick-access-item[data-id='A1']").length, 1);
  assert.equal(document.getElementById("quick-access-count-badge")!.textContent, "1");
});

test("clicking the pin button on a non-favorite item adds it to favorites and re-renders", () => {
  setAppState(baseState({ activities: [makeActivity({ id: "A1", name: "Gala annuel" })] }));
  recordActivityView("A1");
  renderQuickAccessAll();

  const pinBtn = document.querySelector(".pin-quick-access-btn[data-id='A1']") as HTMLElement;
  assert.ok(pinBtn);
  pinBtn.dispatchEvent(new Event("click", { bubbles: true }));

  assert.ok(appState.favorites.includes("A1"));
  assert.ok(document.querySelector(".quick-access-item[data-id='A1'] .remove-quick-access-btn"));
});

test("clicking the unpin (x) button removes it from favorites and re-renders", () => {
  setAppState(baseState({ activities: [makeActivity({ id: "A1", name: "Gala annuel" })], favorites: ["A1"] }));
  renderQuickAccessAll();

  const removeBtn = document.querySelector(".remove-quick-access-btn[data-id='A1']") as HTMLElement;
  assert.ok(removeBtn);
  removeBtn.dispatchEvent(new Event("click", { bubbles: true }));

  assert.equal(appState.favorites.includes("A1"), false);
});

test("initQuickAccessDropdown: toggle button opens/closes the panel, outside click and Escape close it", () => {
  initQuickAccessDropdown();
  const toggleBtn = document.getElementById("quick-access-toggle-btn")!;
  const panel = document.getElementById("quick-access-dropdown-panel")!;

  toggleBtn.dispatchEvent(new Event("click", { bubbles: true }));
  assert.equal(panel.classList.contains("active"), true);

  document.body.dispatchEvent(new Event("click", { bubbles: true }));
  assert.equal(panel.classList.contains("active"), false);

  panel.classList.add("active");
  window.dispatchEvent(new (window as any).KeyboardEvent("keydown", { key: "Escape" }));
  assert.equal(panel.classList.contains("active"), false);
});

test("closeQuickAccessDropdown removes the 'active' class if present, and is a no-op otherwise", () => {
  const panel = document.getElementById("quick-access-dropdown-panel")!;
  panel.classList.add("active");
  closeQuickAccessDropdown();
  assert.equal(panel.classList.contains("active"), false);

  assert.doesNotThrow(() => closeQuickAccessDropdown());
});
export {};
