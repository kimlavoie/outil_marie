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

import React from "react";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import { setAppState, appState, notifyAppStateChange } from "../src/state/state.ts";
import { ActivitiesView } from "../src/components/activities/ActivitiesView.tsx";
import { PeriodSelector } from "../src/components/layout/PeriodSelector.tsx";

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

function activity(id: string, name: string, dateStart: string, overrides: any = {}) {
  return {
    id,
    name,
    date_start: dateStart,
    client_type: "externe",
    state: "brouillon",
    distributions: [],
    reservations: [],
    deleted: false,
    ...overrides
  };
}

test.beforeEach(() => {
  setAppState(baseState());
  document.body.innerHTML = "";
});

test.afterEach(() => cleanup());

test("ActivitiesView filters activities by selected fiscal year", () => {
  setAppState(
    baseState({
      selected_year: "2025-2026",
      selected_quarters: [1, 2, 3, 4],
      activities: [
        activity("act-2025", "Concert 2025", "2025-08-15"), // FY 2025-2026 Q1
        activity("act-2024", "Concert 2024", "2024-08-15")  // FY 2024-2025 Q1
      ]
    })
  );

  const { getByText, queryByText } = render(<ActivitiesView />);

  assert.ok(getByText("Concert 2025"));
  assert.equal(queryByText("Concert 2024"), null);
});

test("ActivitiesView updates filtered list when fiscal year in PeriodSelector changes", async () => {
  setAppState(
    baseState({
      selected_year: "2025-2026",
      selected_quarters: [1, 2, 3, 4],
      activities: [
        activity("act-2025", "Concert 2025", "2025-08-15"), // FY 2025-2026
        activity("act-2024", "Concert 2024", "2024-08-15")  // FY 2024-2025
      ]
    })
  );

  const { getByText, queryByText } = render(
    <div>
      <PeriodSelector />
      <ActivitiesView />
    </div>
  );

  assert.ok(getByText("Concert 2025"));
  assert.equal(queryByText("Concert 2024"), null);

  const select = document.getElementById("top-fiscal-year") as HTMLSelectElement;
  fireEvent.change(select, { target: { value: "2024-2025" } });

  await new Promise(r => setTimeout(r, 50));

  assert.ok(getByText("Concert 2024"));
  assert.equal(queryByText("Concert 2025"), null);
});

test("ActivitiesView filters activities by selected quarters", async () => {
  setAppState(
    baseState({
      selected_year: "2025-2026",
      selected_quarters: [1], // Only Q1 (Jul-Sep)
      activities: [
        activity("act-q1", "Activité Q1", "2025-08-15"), // Q1
        activity("act-q2", "Activité Q2", "2025-11-15")  // Q2
      ]
    })
  );

  const { getByText, queryByText } = render(<ActivitiesView />);

  assert.ok(getByText("Activité Q1"));
  assert.equal(queryByText("Activité Q2"), null);
});

test("ActivitiesView updates when toggling quarters in PeriodSelector", async () => {
  setAppState(
    baseState({
      selected_year: "2025-2026",
      selected_quarters: [1],
      activities: [
        activity("act-q1", "Activité Q1", "2025-08-15"),
        activity("act-q2", "Activité Q2", "2025-11-15")
      ]
    })
  );

  const { getByText, queryByText } = render(
    <div>
      <PeriodSelector />
      <ActivitiesView />
    </div>
  );

  assert.ok(getByText("Activité Q1"));
  assert.equal(queryByText("Activité Q2"), null);

  const q2Btn = document.querySelector('.quarter-toggle[data-q="2"]') as HTMLElement;
  fireEvent.click(q2Btn);

  await new Promise(r => setTimeout(r, 50));

  assert.ok(getByText("Activité Q1"));
  assert.ok(getByText("Activité Q2"));
});

test("ActivitiesView matches activity using first reservation slot date if date_start is missing", () => {
  setAppState(
    baseState({
      selected_year: "2025-2026",
      selected_quarters: [1],
      activities: [
        activity("act-res", "Activité sans date_start", "", {
          reservations: [{ slots: [{ date: "2025-08-20" }] }] // Q1
        }),
        activity("act-res-q2", "Activité Q2 sans date_start", "", {
          reservations: [{ slots: [{ date: "2025-11-20" }] }] // Q2
        })
      ]
    })
  );

  const { getByText, queryByText } = render(<ActivitiesView />);

  assert.ok(getByText("Activité sans date_start"));
  assert.equal(queryByText("Activité Q2 sans date_start"), null);
});
