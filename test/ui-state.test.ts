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
import { activitiesState } from "../src/activities/render.ts";
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
  activitiesState.sortKey = "id";
  activitiesState.sortOrder = "asc";
  activitiesState.page = 1;
  activitiesState.pageSize = 10;
  reconciliationState.filter = "all";
  reconciliationState.page = 1;
  reconciliationState.pageSize = 10;
  accountReportState.sortKey = "id";
  accountReportState.sortOrder = "asc";
  accountReportState.pageSize = 10;
  accountReportState.pages = {};
});

test("saveUiState persists the search box, filters and sort/pagination state under one localStorage key", () => {
  document.body.innerHTML = `
    <input id="activity-search" value="conférence">
    <select id="filter-report-account"><option value="892-1" selected>892-1</option></select>
  `;
  activitiesState.sortKey = "name";
  activitiesState.sortOrder = "desc";
  activitiesState.page = 3;
  activitiesState.pageSize = 25;
  reconciliationState.filter = "unmatched";
  reconciliationState.page = 2;
  accountReportState.sortKey = "amount";

  saveUiState();

  const saved = JSON.parse((globalThis as any).localStorage.getItem(UI_STATE_KEY)!);
  assert.equal(saved.activities.search, "conférence");
  assert.equal(saved.activities.sortKey, "name");
  assert.equal(saved.activities.sortOrder, "desc");
  assert.equal(saved.activities.page, 3);
  assert.equal(saved.activities.pageSize, 25);
  assert.equal(saved.reconciliation.filter, "unmatched");
  assert.equal(saved.reconciliation.page, 2);
  assert.equal(saved.accountReport.filterAccount, "892-1");
  assert.equal(saved.accountReport.sortKey, "amount");
});

test("saveUiState defaults the search/filter fields to empty strings when the elements aren't present", () => {
  saveUiState();
  const saved = JSON.parse((globalThis as any).localStorage.getItem(UI_STATE_KEY)!);
  assert.equal(saved.activities.search, "");
  assert.equal(saved.accountReport.filterAccount, "");
});

test("restoreUiState is a no-op when nothing was ever saved", () => {
  document.body.innerHTML = `<input id="activity-search" value="">`;
  restoreUiState();
  assert.equal((document.getElementById("activity-search") as HTMLInputElement).value, "");
  assert.equal(activitiesState.page, 1);
});

test("restoreUiState round-trips everything saveUiState wrote", () => {
  document.body.innerHTML = `
    <input id="activity-search" value="conférence">
    <select id="filter-report-account"><option value="892-1" selected>892-1</option></select>
  `;
  activitiesState.sortKey = "name";
  activitiesState.sortOrder = "desc";
  activitiesState.page = 3;
  activitiesState.pageSize = 25;
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
    <input id="activity-search" value="">
    <select id="filter-report-account"><option value="892-1">892-1</option></select>
  `;
  activitiesState.sortKey = "id";
  activitiesState.sortOrder = "asc";
  activitiesState.page = 1;
  activitiesState.pageSize = 10;
  reconciliationState.filter = "all";
  reconciliationState.page = 1;
  reconciliationState.pageSize = 10;
  accountReportState.sortKey = "id";
  accountReportState.sortOrder = "asc";
  accountReportState.pageSize = 10;
  accountReportState.pages = {};

  restoreUiState();

  assert.equal((document.getElementById("activity-search") as HTMLInputElement).value, "conférence");
  assert.equal(activitiesState.sortKey, "name");
  assert.equal(activitiesState.sortOrder, "desc");
  assert.equal(activitiesState.page, 3);
  assert.equal(activitiesState.pageSize, 25);
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
