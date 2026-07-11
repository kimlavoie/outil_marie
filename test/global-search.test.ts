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
import { globalSearchMatches, renderGlobalSearchResults, openGlobalSearchResult, initGlobalSearch } from "../src/navigation/global-search.ts";

function baseState(overrides: any = {}) {
  return {
    settings: {
      theme: "dark",
      rooms: [],
      departments: ["Direction générale", "Communications"],
      accounts: [
        { code: "892-1111-00-000", description: "Location de salle" },
        { code: "892-2222-00-000", description: "Frais divers" }
      ],
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
    ...overrides
  };
}

function setupFixture() {
  document.body.innerHTML = `
    <input id="global-search-input">
    <div id="global-search-results"></div>
  `;
}

function flush(ms = 300): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

test.beforeEach(() => {
  setAppState(baseState());
  setupFixture();
});

test("globalSearchMatches matches a case-insensitive substring", () => {
  assert.equal(globalSearchMatches("Marie Tremblay", "tremblay"), true);
  assert.equal(globalSearchMatches("Marie Tremblay", "TREMBLAY"), true);
});

test("globalSearchMatches falls back to fuzzy similarity for non-substring matches", () => {
  assert.equal(globalSearchMatches("Réservation Salle A", "reservation salle a"), true);
  assert.equal(globalSearchMatches("Spectacle de danse", "vente de billets"), false);
});

test("renderGlobalSearchResults clears the panel and deactivates it for an empty query", () => {
  const panel = document.getElementById("global-search-results")!;
  panel.classList.add("active");
  panel.innerHTML = "stale content";

  renderGlobalSearchResults("");

  assert.equal(panel.classList.contains("active"), false);
  assert.equal(panel.innerHTML, "");
});

test("renderGlobalSearchResults shows 'Aucun résultat' and activates the panel when nothing matches", () => {
  setAppState(baseState({ activities: [makeActivity()] }));
  renderGlobalSearchResults("zzz-introuvable");

  const panel = document.getElementById("global-search-results")!;
  assert.match(panel.innerHTML, /Aucun résultat/);
  assert.equal(panel.classList.contains("active"), true);
});

test("renderGlobalSearchResults matches activities (excluding deleted/blank-name), accounts and departments", () => {
  setAppState(
    baseState({
      activities: [
        makeActivity({ id: "A1", name: "Gala annuel" }),
        makeActivity({ id: "A2", name: "Gala secret", deleted: true }),
        makeActivity({ id: "A3", name: "", responsable: "Gala organizer" }) // blank name: excluded even if it matches
      ]
    })
  );

  renderGlobalSearchResults("gala");

  const panel = document.getElementById("global-search-results")!;
  const activityResults = [...panel.querySelectorAll('.global-search-result[data-type="activity"]')].map(el => el.getAttribute("data-id"));
  assert.deepEqual(activityResults, ["A1"]);

  renderGlobalSearchResults("892-1111");
  const accountResults = [...panel.querySelectorAll('.global-search-result[data-type="account"]')].map(el => el.getAttribute("data-id"));
  assert.deepEqual(accountResults, ["892-1111-00-000"]);

  renderGlobalSearchResults("communications");
  const deptResults = [...panel.querySelectorAll('.global-search-result[data-type="department"]')].map(el => el.getAttribute("data-id"));
  assert.deepEqual(deptResults, ["Communications"]);
});

test("renderGlobalSearchResults caps each category at 5 results", () => {
  const acts = Array.from({ length: 7 }, (_, i) => makeActivity({ id: `A${i}`, name: `Gala ${i}` }));
  setAppState(baseState({ activities: acts }));

  renderGlobalSearchResults("gala");

  const panel = document.getElementById("global-search-results")!;
  assert.equal(panel.querySelectorAll('.global-search-result[data-type="activity"]').length, 5);
});

test("openGlobalSearchResult doesn't throw for any result type, even when the target id doesn't exist", () => {
  setAppState(baseState({ activities: [] }));
  assert.doesNotThrow(() => openGlobalSearchResult("activity", "unknown-id"));
  assert.doesNotThrow(() => openGlobalSearchResult("account", "unknown-code"));
  assert.doesNotThrow(() => openGlobalSearchResult("department", "unknown-dept"));
});

test("initGlobalSearch: typing debounces into a re-render, focus reopens a non-empty search, outside click and Escape close it", async () => {
  setAppState(baseState({ activities: [makeActivity({ id: "A1", name: "Gala annuel" })] }));
  initGlobalSearch();

  const input = document.getElementById("global-search-input") as HTMLInputElement;
  const panel = document.getElementById("global-search-results")!;

  input.value = "gala";
  input.dispatchEvent(new Event("input"));
  await flush();
  assert.equal(panel.classList.contains("active"), true);
  assert.ok(panel.querySelector('.global-search-result[data-type="activity"]'));

  panel.classList.remove("active");
  input.dispatchEvent(new Event("focus"));
  assert.equal(panel.classList.contains("active"), true);

  document.body.dispatchEvent(new Event("click", { bubbles: true }));
  assert.equal(panel.classList.contains("active"), false);

  panel.classList.add("active");
  window.dispatchEvent(new (window as any).KeyboardEvent("keydown", { key: "Escape" }));
  assert.equal(panel.classList.contains("active"), false);
});
export {};
