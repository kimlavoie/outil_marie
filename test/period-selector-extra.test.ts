import test from "node:test";
import assert from "node:assert/strict";
import "./indexeddb-mock.ts";
import { dom } from "./dom-mock.ts";

test.after(() => dom.window.close());

import { setAppState, appState } from "../src/state/state.ts";
import { updateActivePeriodDescription, initPeriodSelector, populateFiscalYears, getFiscalYearWindow } from "../src/navigation/period-selector.ts";

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

function setupFixture() {
  document.body.innerHTML = `
    <div id="active-period-description"></div>
    <select id="top-fiscal-year"></select>
    <button class="quarter-toggle" data-q="1"></button>
    <button class="quarter-toggle" data-q="2"></button>
    <button class="quarter-toggle" data-q="3"></button>
    <button class="quarter-toggle" data-q="4"></button>
  `;
}

test.beforeEach(() => {
  setAppState(baseState());
  setupFixture();
});

test("updateActivePeriodDescription warns when no fiscal year or no quarter is selected", () => {
  setAppState(baseState({ selected_year: "" }));
  updateActivePeriodDescription();
  assert.match(document.getElementById("active-period-description")!.innerHTML, /Aucune année financière/);

  setAppState(baseState({ selected_quarters: [] }));
  updateActivePeriodDescription();
  assert.match(document.getElementById("active-period-description")!.innerHTML, /Aucun trimestre sélectionné/);
});

test("updateActivePeriodDescription describes all 4 quarters as the full July-June fiscal year", () => {
  setAppState(baseState({ selected_year: "2025-2026", selected_quarters: [1, 2, 3, 4] }));
  updateActivePeriodDescription();
  const html = document.getElementById("active-period-description")!.innerHTML;
  assert.match(html, /1er juillet 2025/);
  assert.match(html, /30 juin 2026/);
});

test("updateActivePeriodDescription describes a contiguous quarter range as a single date span", () => {
  setAppState(baseState({ selected_year: "2025-2026", selected_quarters: [1, 2] }));
  updateActivePeriodDescription();
  const html = document.getElementById("active-period-description")!.innerHTML;
  assert.match(html, /1er juillet 2025/);
  assert.match(html, /31 décembre 2025/);
});

test("updateActivePeriodDescription lists non-contiguous quarters individually", () => {
  setAppState(baseState({ selected_year: "2025-2026", selected_quarters: [1, 3] }));
  updateActivePeriodDescription();
  const html = document.getElementById("active-period-description")!.innerHTML;
  assert.match(html, /T1 \(Juil-Sept 2025\)/);
  assert.match(html, /T3 \(Janv-Mars 2026\)/);
  assert.doesNotMatch(html, /T2/);
});

test("populateFiscalYears offers the rolling window plus any fiscal year an existing (non-deleted) activity falls in, marking the selected one", () => {
  setAppState(
    baseState({
      selected_year: "2025-2026",
      activities: [
        { id: "A1", date_start: "2040-08-01", deleted: false }, // far future: outside the rolling window
        { id: "A2", date_start: "2040-08-02", deleted: true } // deleted: must not extend the window
      ]
    })
  );

  populateFiscalYears();

  const select = document.getElementById("top-fiscal-year") as HTMLSelectElement;
  const options = [...select.options].map(o => o.value);
  const window = getFiscalYearWindow();
  window.forEach(fy => assert.ok(options.includes(fy), `expected rolling window year ${fy} to be present`));
  assert.ok(options.includes("2040-2041"), "a non-deleted activity's fiscal year must be added even outside the window");
  assert.equal(options.filter(fy => fy.startsWith("2040")).length, 1, "the deleted activity's fiscal year must not also be added");
  assert.equal(select.querySelector("option[selected]")!.getAttribute("value"), "2025-2026");
});

test("initPeriodSelector marks the quarter buttons active/inactive to match appState.selected_quarters", () => {
  setAppState(baseState({ selected_quarters: [1, 3] }));
  initPeriodSelector();

  assert.equal(document.querySelector('.quarter-toggle[data-q="1"]')!.classList.contains("active"), true);
  assert.equal(document.querySelector('.quarter-toggle[data-q="2"]')!.classList.contains("active"), false);
  assert.equal(document.querySelector('.quarter-toggle[data-q="3"]')!.classList.contains("active"), true);
  assert.equal(document.querySelector('.quarter-toggle[data-q="4"]')!.classList.contains("active"), false);
});

test("clicking an inactive quarter toggle adds it to appState.selected_quarters and persists it", async () => {
  setAppState(baseState({ selected_quarters: [1] }));
  initPeriodSelector();

  const q2Btn = document.querySelector('.quarter-toggle[data-q="2"]') as HTMLElement;
  q2Btn.dispatchEvent(new Event("click"));
  await new Promise(r => setTimeout(r, 100));

  assert.deepEqual([...appState.selected_quarters].sort(), [1, 2]);
  assert.equal(q2Btn.classList.contains("active"), true);
});

test("clicking an active quarter toggle removes it from appState.selected_quarters", async () => {
  setAppState(baseState({ selected_quarters: [1, 2] }));
  initPeriodSelector();

  const q2Btn = document.querySelector('.quarter-toggle[data-q="2"]') as HTMLElement;
  q2Btn.dispatchEvent(new Event("click"));
  await new Promise(r => setTimeout(r, 100));

  assert.deepEqual([...appState.selected_quarters], [1]);
  assert.equal(q2Btn.classList.contains("active"), false);
});

test("changing the fiscal year select updates appState.selected_year and persists it", async () => {
  setAppState(baseState({ selected_year: "2025-2026" }));
  populateFiscalYears();
  initPeriodSelector();

  const select = document.getElementById("top-fiscal-year") as HTMLSelectElement;
  select.value = "2026-2027";
  select.dispatchEvent(new Event("change"));
  await new Promise(r => setTimeout(r, 100));

  assert.equal(appState.selected_year, "2026-2027");
});
export {};
