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
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { act } from "react";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { setAppState } from "../src/state/state.ts";
import { saveUiState } from "../src/state/ui-state.ts";
import { AccountReportView } from "../src/components/account-report/AccountReportView.tsx";

// Regression coverage for the accountReport analogue of the "activities" localStorage-clobbering
// bug fixed earlier: saveUiState() (state/ui-state.ts) used to rebuild its own "accountReport"
// slice from a dead legacy object (accountReportState, never read by this view) on every call.
// That was inert rather than actively harmful (nothing ever restored that slice), but the filter
// AccountReportView.tsx itself persists must still survive an unrelated saveUiState() call
// elsewhere in the app (drawer close, autosave, undo...), and must actually come back on reload.

function baseState(overrides: any = {}) {
  return {
    settings: {
      theme: "dark",
      rooms: [],
      departments: [],
      accounts: [
        { code: "892-1111", description: "Location de salle" },
        { code: "892-2222", description: "Frais divers" }
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
    selected_year: "2025-2026",
    selected_quarters: [1, 2, 3, 4],
    ...overrides
  };
}

test.beforeEach(() => {
  setAppState(baseState());
  document.body.innerHTML = "";
  localStorage.clear();
});

test.afterEach(() => cleanup());

test("changing the account filter persists it to localStorage and survives a later saveUiState() call", () => {
  const { container } = render(<AccountReportView onSelectView={() => {}} />);
  const select = container.querySelector("#filter-report-account") as HTMLSelectElement;

  act(() => fireEvent.change(select, { target: { value: "892-1111" } }));

  const savedAfterFilter = JSON.parse(localStorage.getItem("outil_marie_ui_state")!);
  assert.equal(savedAfterFilter.accountReport.filterAccount, "892-1111");

  // Simulate an unrelated action elsewhere in the app that flushes UI state.
  saveUiState();

  const savedAfterFlush = JSON.parse(localStorage.getItem("outil_marie_ui_state")!);
  assert.equal(savedAfterFlush.accountReport.filterAccount, "892-1111");
});

test("the persisted account filter is restored on the next mount", () => {
  localStorage.setItem(
    "outil_marie_ui_state",
    JSON.stringify({ accountReport: { filterAccount: "892-2222", sortKey: "amount", sortOrder: "desc", pages: {} } })
  );

  const { container } = render(<AccountReportView onSelectView={() => {}} />);
  const select = container.querySelector("#filter-report-account") as HTMLSelectElement;

  assert.equal(select.value, "892-2222");
});

export {};
