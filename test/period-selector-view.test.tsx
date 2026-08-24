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
import { setAppState, appState, getDefaultFiscalYear } from "../src/state/state.ts";
import { PeriodSelector } from "../src/components/layout/PeriodSelector.tsx";

// Replaces test/period-selector.test.ts and test/period-selector-extra.test.ts, which tested
// navigation/period-selector.ts — a legacy insertAdjacentHTML-based module fully superseded by
// this component (see navigation.ts's header comment; the module has been deleted).

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
    selected_year: "2025-2026",
    selected_quarters: [1, 2, 3, 4],
    ...overrides
  };
}

test.beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

test.afterEach(() => cleanup());

test("warns when no fiscal year or no quarter is selected", () => {
  setAppState(baseState({ selected_year: "" }));
  let container = render(<PeriodSelector />).container;
  assert.match(container.querySelector(".active-period-description")!.textContent!, /Aucune année financière/);
  cleanup();

  setAppState(baseState({ selected_quarters: [] }));
  container = render(<PeriodSelector />).container;
  assert.match(container.querySelector(".active-period-description")!.textContent!, /Aucun trimestre sélectionné/);
});

test("describes all 4 quarters as the full July-June fiscal year", () => {
  setAppState(baseState({ selected_year: "2025-2026", selected_quarters: [1, 2, 3, 4] }));
  const { container } = render(<PeriodSelector />);
  const text = container.querySelector(".active-period-description")!.textContent!;
  assert.match(text, /1er juillet 2025/);
  assert.match(text, /30 juin 2026/);
});

test("describes a contiguous quarter range as a single date span", () => {
  setAppState(baseState({ selected_year: "2025-2026", selected_quarters: [1, 2] }));
  const { container } = render(<PeriodSelector />);
  const text = container.querySelector(".active-period-description")!.textContent!;
  assert.match(text, /1er juillet 2025/);
  assert.match(text, /31 décembre 2025/);
});

test("lists non-contiguous quarters individually", () => {
  setAppState(baseState({ selected_year: "2025-2026", selected_quarters: [1, 3] }));
  const { container } = render(<PeriodSelector />);
  const text = container.querySelector(".active-period-description")!.textContent!;
  assert.match(text, /T1 \(Juil-Sept 2025\)/);
  assert.match(text, /T3 \(Janv-Mars 2026\)/);
  assert.doesNotMatch(text, /T2/);
});

test("the fiscal-year select offers the rolling window plus any fiscal year an existing (non-deleted) activity falls in, marking the selected one", () => {
  setAppState(
    baseState({
      selected_year: "2025-2026",
      activities: [
        { id: "A1", date_start: "2040-08-01", deleted: false }, // far future: outside the rolling window
        { id: "A2", date_start: "2040-08-02", deleted: true } // deleted: must not extend the window
      ] as any
    })
  );

  const { container } = render(<PeriodSelector />);
  const select = container.querySelector("#top-fiscal-year") as HTMLSelectElement;
  const options = [...select.options].map(o => o.value);

  const currentStartYear = parseInt(getDefaultFiscalYear().split("-")[0], 10);
  const rollingWindow = [-1, 0, 1, 2, 3].map(offset => `${currentStartYear + offset}-${currentStartYear + offset + 1}`);
  rollingWindow.forEach(fy => assert.ok(options.includes(fy), `expected rolling window year ${fy} to be present`));
  assert.ok(options.includes("2040-2041"), "a non-deleted activity's fiscal year must be added even outside the window");
  assert.equal(options.filter(fy => fy.startsWith("2040")).length, 1, "the deleted activity's fiscal year must not also be added");
  assert.equal(select.value, "2025-2026");
});

test("marks the quarter buttons active/inactive to match appState.selected_quarters", () => {
  setAppState(baseState({ selected_quarters: [1, 3] }));
  const { container } = render(<PeriodSelector />);

  assert.equal(container.querySelector('.quarter-toggle[data-q="1"]')!.classList.contains("active"), true);
  assert.equal(container.querySelector('.quarter-toggle[data-q="2"]')!.classList.contains("active"), false);
  assert.equal(container.querySelector('.quarter-toggle[data-q="3"]')!.classList.contains("active"), true);
  assert.equal(container.querySelector('.quarter-toggle[data-q="4"]')!.classList.contains("active"), false);
});

test("clicking an inactive quarter toggle adds it to appState.selected_quarters and persists it", async () => {
  setAppState(baseState({ selected_quarters: [1] }));
  const { container } = render(<PeriodSelector />);

  const q2Btn = container.querySelector('.quarter-toggle[data-q="2"]') as HTMLElement;
  await act(async () => {
    fireEvent.click(q2Btn);
    await new Promise(r => setTimeout(r, 100));
  });

  assert.deepEqual([...appState.selected_quarters].sort(), [1, 2]);
});

test("clicking an active quarter toggle removes it from appState.selected_quarters", async () => {
  setAppState(baseState({ selected_quarters: [1, 2] }));
  const { container } = render(<PeriodSelector />);

  const q2Btn = container.querySelector('.quarter-toggle[data-q="2"]') as HTMLElement;
  await act(async () => {
    fireEvent.click(q2Btn);
    await new Promise(r => setTimeout(r, 100));
  });

  assert.deepEqual([...appState.selected_quarters], [1]);
});

test("changing the fiscal year select updates appState.selected_year and persists it", async () => {
  setAppState(baseState({ selected_year: "2025-2026" }));
  const { container } = render(<PeriodSelector />);

  const select = container.querySelector("#top-fiscal-year") as HTMLSelectElement;
  await act(async () => {
    fireEvent.change(select, { target: { value: "2026-2027" } });
    await new Promise(r => setTimeout(r, 100));
  });

  assert.equal(appState.selected_year, "2026-2027");
});

export {};
