import test from "node:test";
import assert from "node:assert/strict";
import "./indexeddb-mock.ts";
import { dom } from "./dom-mock.ts";

test.after(() => dom.window.close());

(globalThis as any).localStorage = {
  store: {} as Record<string, string>,
  getItem(key: string) { return this.store[key] || null; },
  setItem(key: string, value: string) { this.store[key] = String(value); },
  removeItem(key: string) { delete this.store[key]; },
  clear() { this.store = {}; }
};
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { act } from "react";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { setAppState } from "../src/state/state.ts";
import { GlobalSearch } from "../src/components/layout/GlobalSearch.tsx";

// Replaces test/global-search.test.ts, which tested navigation/global-search.ts — a legacy
// insertAdjacentHTML-based module with no live caller left at all (its own header comment already
// said so), fully superseded by this component (see navigation.ts's header comment; the module has
// been deleted).

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
      schedulable_tasks: [],
      tax_rates: { tps: 0.05, tvq: 0.09975 }
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

function typeQuery(input: HTMLInputElement, value: string) {
  act(() => fireEvent.change(input, { target: { value } }));
}

test.beforeEach(() => {
  setAppState(baseState());
  document.body.innerHTML = "";
});

test.afterEach(() => cleanup());

test("shows 'Aucun résultat' when nothing matches", () => {
  setAppState(baseState({ activities: [makeActivity()] }));
  const { container } = render(<GlobalSearch onSelectView={() => {}} />);
  const input = container.querySelector("#global-search-input") as HTMLInputElement;

  typeQuery(input, "zzz-introuvable");

  assert.match(container.querySelector("#global-search-results")!.textContent!, /Aucun résultat/);
});

test("matches activities (excluding deleted/blank-name), accounts and departments", () => {
  setAppState(
    baseState({
      activities: [
        makeActivity({ id: "A1", name: "Gala annuel" }),
        makeActivity({ id: "A2", name: "Gala secret", deleted: true }),
        makeActivity({ id: "A3", name: "", responsable: "Gala organizer" }) // blank name: excluded even if it matches
      ]
    })
  );
  const { container } = render(<GlobalSearch onSelectView={() => {}} />);
  const input = container.querySelector("#global-search-input") as HTMLInputElement;

  typeQuery(input, "gala");
  let resultsText = container.querySelector("#global-search-results")!.textContent!;
  assert.match(resultsText, /Gala annuel/);
  assert.doesNotMatch(resultsText, /Gala secret/);
  assert.doesNotMatch(resultsText, /Gala organizer/);

  typeQuery(input, "892-1111");
  resultsText = container.querySelector("#global-search-results")!.textContent!;
  assert.match(resultsText, /892-1111-00-000/);

  typeQuery(input, "communications");
  resultsText = container.querySelector("#global-search-results")!.textContent!;
  assert.match(resultsText, /Communications/);
});

test("fuzzy-matches close typos, not unrelated text", () => {
  setAppState(baseState({ activities: [makeActivity({ id: "A1", name: "Réservation Salle A" })] }));
  const { container } = render(<GlobalSearch onSelectView={() => {}} />);
  const input = container.querySelector("#global-search-input") as HTMLInputElement;

  typeQuery(input, "reservation salle a");
  assert.match(container.querySelector("#global-search-results")!.textContent!, /Réservation Salle A/);

  typeQuery(input, "vente de billets");
  assert.doesNotMatch(container.querySelector("#global-search-results")!.textContent!, /Réservation Salle A/);
});

test("caps each category at 5 results", () => {
  const acts = Array.from({ length: 7 }, (_, i) => makeActivity({ id: `A${i}`, name: `Gala ${i}` }));
  setAppState(baseState({ activities: acts }));
  const { container } = render(<GlobalSearch onSelectView={() => {}} />);
  const input = container.querySelector("#global-search-input") as HTMLInputElement;

  typeQuery(input, "gala");

  assert.equal(container.querySelectorAll(".global-search-result").length, 5);
});

test("clicking a result clears the query, closes the panel and navigates", () => {
  // Uses an account (not activity) result: clicking an activity result also calls the real
  // openActivityDrawer(), which needs the full <ActivityDrawer /> tree mounted to find its form —
  // irrelevant to what this test is checking (the panel's own close/clear/navigate contract).
  setAppState(baseState());
  let selectedView: string | null = null;
  const { container } = render(<GlobalSearch onSelectView={v => (selectedView = v)} />);
  const input = container.querySelector("#global-search-input") as HTMLInputElement;

  typeQuery(input, "892-1111");
  const result = container.querySelector(".global-search-result") as HTMLElement;
  act(() => fireEvent.click(result));

  assert.equal(selectedView, "settings");
  assert.equal(input.value, "");
  assert.equal(container.querySelector("#global-search-results"), null);
});

test("focusing a non-empty search reopens the results, outside click and Escape close them", () => {
  setAppState(baseState({ activities: [makeActivity({ id: "A1", name: "Gala annuel" })] }));
  const { container } = render(
    <div>
      <div id="outside">dehors</div>
      <GlobalSearch onSelectView={() => {}} />
    </div>
  );
  const input = container.querySelector("#global-search-input") as HTMLInputElement;

  typeQuery(input, "gala");
  assert.ok(container.querySelector("#global-search-results"));

  act(() => fireEvent.click(document.getElementById("outside")!));
  assert.equal(container.querySelector("#global-search-results"), null);

  act(() => fireEvent.focus(input));
  assert.ok(container.querySelector("#global-search-results"));

  act(() => fireEvent.keyDown(window, { key: "Escape" }));
  assert.equal(container.querySelector("#global-search-results"), null);
});

export {};
