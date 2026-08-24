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
import { setAppState, appState, formatDateStrLocal, recordActivityView } from "../src/state/state.ts";
import { QuickAccess } from "../src/components/layout/QuickAccess.tsx";

// Replaces test/quick-access.test.ts, which tested navigation/quick-access.ts — a legacy
// insertAdjacentHTML-based module fully superseded by this component (see navigation.ts's header
// comment: it also wrote into #quick-access-list-global, the very node QuickAccess.tsx renders
// while its dropdown is open, a real DOM-ownership conflict — the module has been deleted).

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

function openDropdown(container: HTMLElement) {
  act(() => fireEvent.click(container.querySelector("#quick-access-toggle-btn")!));
}

test.beforeEach(() => {
  setAppState(baseState());
  document.body.innerHTML = "";
  localStorage.clear();
});

test.afterEach(() => cleanup());

test("shows the empty-state message and no badge with nothing pinned/recent/upcoming", () => {
  setAppState(baseState({ activities: [makeActivity()] }));
  const { container } = render(<QuickAccess onSelectView={() => {}} />);
  openDropdown(container);

  assert.match(container.querySelector("#quick-access-list-global")!.textContent!, /Aucune activité épinglée/);
  assert.equal(container.querySelector("#quick-access-count-badge"), null);
});

test("lists pinned favorites under 'Épinglées' with an unpin button", () => {
  setAppState(baseState({ activities: [makeActivity({ id: "A1", name: "Gala annuel" })], favorites: ["A1"] }));
  const { container } = render(<QuickAccess onSelectView={() => {}} />);
  openDropdown(container);

  const list = container.querySelector("#quick-access-list-global")!;
  assert.match(list.textContent!, /Gala annuel/);
  assert.ok(list.querySelector(".remove-quick-access-btn"));
  assert.equal(list.querySelector(".pin-quick-access-btn"), null);
  assert.equal(container.querySelector("#quick-access-count-badge")!.textContent, "1");
});

test("lists activities starting within the next 30 days under 'À venir bientôt', excluding those outside the window", () => {
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
  const { container } = render(<QuickAccess onSelectView={() => {}} />);
  openDropdown(container);

  const text = container.querySelector("#quick-access-list-global")!.textContent!;
  assert.match(text, /Bientôt/);
  assert.match(text, /Aujourd'hui/);
  assert.doesNotMatch(text, /Trop loin/);
  assert.doesNotMatch(text, /Passée/);
});

test("de-duplicates an activity that is both favorite and recently viewed, keeping only the higher-priority 'favorite' section", () => {
  setAppState(baseState({ activities: [makeActivity({ id: "A1", name: "Gala annuel" })], favorites: ["A1"] }));
  recordActivityView("A1");

  const { container } = render(<QuickAccess onSelectView={() => {}} />);
  openDropdown(container);

  const list = container.querySelector("#quick-access-list-global")!;
  assert.equal(list.querySelectorAll(".quick-access-item").length, 1);
  assert.equal(container.querySelector("#quick-access-count-badge")!.textContent, "1");
});

test("clicking the pin button on a non-favorite item adds it to favorites", async () => {
  setAppState(baseState({ activities: [makeActivity({ id: "A1", name: "Gala annuel" })] }));
  recordActivityView("A1");
  const { container } = render(<QuickAccess onSelectView={() => {}} />);
  openDropdown(container);

  const pinBtn = container.querySelector(".pin-quick-access-btn") as HTMLElement;
  assert.ok(pinBtn);
  await act(async () => {
    fireEvent.click(pinBtn);
    await new Promise(r => setTimeout(r, 50));
  });

  assert.ok(appState.favorites.includes("A1"));
  assert.ok(container.querySelector(".remove-quick-access-btn"));
});

test("clicking the unpin (x) button removes it from favorites", () => {
  setAppState(baseState({ activities: [makeActivity({ id: "A1", name: "Gala annuel" })], favorites: ["A1"] }));
  const { container } = render(<QuickAccess onSelectView={() => {}} />);
  openDropdown(container);

  const removeBtn = container.querySelector(".remove-quick-access-btn") as HTMLElement;
  assert.ok(removeBtn);
  act(() => fireEvent.click(removeBtn));

  assert.equal(appState.favorites.includes("A1"), false);
});

test("outside click and Escape close the open dropdown", () => {
  setAppState(baseState({ activities: [makeActivity({ id: "A1", name: "Gala annuel" })], favorites: ["A1"] }));
  const { container } = render(
    <div>
      <div id="outside">dehors</div>
      <QuickAccess onSelectView={() => {}} />
    </div>
  );
  openDropdown(container);
  assert.ok(container.querySelector("#quick-access-dropdown-panel"));

  act(() => fireEvent.click(document.getElementById("outside")!));
  assert.equal(container.querySelector("#quick-access-dropdown-panel"), null);

  openDropdown(container);
  assert.ok(container.querySelector("#quick-access-dropdown-panel"));
  act(() => fireEvent.keyDown(window, { key: "Escape" }));
  assert.equal(container.querySelector("#quick-access-dropdown-panel"), null);
});

export {};
