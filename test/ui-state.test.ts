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

import { setAppState } from "../src/state/state.ts";
import { saveUiState, restoreUiState } from "../src/state/ui-state.ts";
import { reconciliationState } from "../src/services/reconciliation.ts";
import { accountReportState } from "../src/services/account-report.ts";

const UI_STATE_KEY = "outil_marie_ui_state";

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

test.beforeEach(() => {
  setAppState(baseState());
  document.body.innerHTML = "";
  (globalThis as any).localStorage.clear();
  reconciliationState.filter = "all";
  reconciliationState.page = 1;
  reconciliationState.pageSize = 10;
  accountReportState.sortKey = "id";
  accountReportState.sortOrder = "asc";
  accountReportState.pageSize = 10;
  accountReportState.pages = {};
});

// The "activities" slice of outil_marie_ui_state is saved/restored entirely by
// ActivitiesView.tsx itself (its own localStorage effect + getSavedUiState() read) — this module
// used to also generate/restore that slice from dead legacy globals (activitiesState.sortKey/
// page/etc., #filter-salle-panel and friends, none of which the live app reads or writes anymore),
// which silently clobbered ActivitiesView's correct, persisted values back to defaults on every
// saveUiState() call (there are ~15 call sites: drawer close, autosave, undo, bulk actions, etc.).
// So there's deliberately no "activities" coverage left here — see ui-state.ts's header comment.

test("saveUiState persists reconciliation and account-report sort/pagination state under one localStorage key", () => {
  document.body.innerHTML = `
    <select id="filter-report-account"><option value="892-1" selected>892-1</option></select>
  `;
  reconciliationState.filter = "unmatched";
  reconciliationState.page = 2;
  accountReportState.sortKey = "amount";

  saveUiState();

  const saved = JSON.parse((globalThis as any).localStorage.getItem(UI_STATE_KEY)!);
  assert.equal(saved.reconciliation.filter, "unmatched");
  assert.equal(saved.reconciliation.page, 2);
  assert.equal(saved.accountReport.filterAccount, "892-1");
  assert.equal(saved.accountReport.sortKey, "amount");
  assert.equal(saved.activities, undefined);
});

test("saveUiState defaults the account-report account filter to an empty string when the element isn't present", () => {
  saveUiState();
  const saved = JSON.parse((globalThis as any).localStorage.getItem(UI_STATE_KEY)!);
  assert.equal(saved.accountReport.filterAccount, "");
});

test("restoreUiState is a no-op when nothing was ever saved", () => {
  restoreUiState();
  assert.equal(reconciliationState.page, 1);
});

test("restoreUiState round-trips everything saveUiState wrote", () => {
  document.body.innerHTML = `
    <select id="filter-report-account"><option value="892-1" selected>892-1</option></select>
  `;
  reconciliationState.filter = "unmatched";
  reconciliationState.page = 2;
  reconciliationState.pageSize = 50;
  accountReportState.sortKey = "amount";
  accountReportState.sortOrder = "desc";
  accountReportState.pageSize = 15;
  accountReportState.pages = { "892-1": 4 };
  saveUiState();

  // Reset everything back to defaults before restoring, to prove restoreUiState is what put it back.
  document.body.innerHTML = `
    <select id="filter-report-account"><option value="892-1">892-1</option></select>
  `;
  reconciliationState.filter = "all";
  reconciliationState.page = 1;
  reconciliationState.pageSize = 10;
  accountReportState.sortKey = "id";
  accountReportState.sortOrder = "asc";
  accountReportState.pageSize = 10;
  accountReportState.pages = {};

  restoreUiState();

  assert.equal(reconciliationState.filter, "unmatched");
  assert.equal(reconciliationState.page, 2);
  assert.equal(reconciliationState.pageSize, 50);
  assert.equal((document.getElementById("filter-report-account") as HTMLSelectElement).value, "892-1");
  assert.equal(accountReportState.sortKey, "amount");
  assert.equal(accountReportState.sortOrder, "desc");
  assert.equal(accountReportState.pageSize, 15);
  assert.deepEqual(accountReportState.pages, { "892-1": 4 });
});

test("restoreUiState toggles the matching .reconcile-tab's active class to reflect the restored filter", () => {
  document.body.innerHTML = `
    <button class="reconcile-tab" data-recon-filter="all">Tout</button>
    <button class="reconcile-tab" data-recon-filter="unmatched">Non concilié</button>
  `;
  (globalThis as any).localStorage.setItem(UI_STATE_KEY, JSON.stringify({ reconciliation: { filter: "unmatched" } }));

  restoreUiState();

  const tabs = Array.from(document.querySelectorAll(".reconcile-tab"));
  assert.equal(tabs.find(t => t.getAttribute("data-recon-filter") === "unmatched")!.classList.contains("active"), true);
  assert.equal(tabs.find(t => t.getAttribute("data-recon-filter") === "all")!.classList.contains("active"), false);
});

test("restoreUiState ignores malformed JSON instead of throwing", () => {
  (globalThis as any).localStorage.setItem(UI_STATE_KEY, "{not json");
  assert.doesNotThrow(() => restoreUiState());
});

export {};
