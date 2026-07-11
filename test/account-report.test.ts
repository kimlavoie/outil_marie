import test from "node:test";
import assert from "node:assert/strict";

(globalThis as any).localStorage = {
  store: {} as Record<string, string>,
  getItem(key: string) { return this.store[key] || null; },
  setItem(key: string, value: string) { this.store[key] = String(value); },
  removeItem(key: string) { delete this.store[key]; },
  clear() { this.store = {}; }
};

import { accountReportState, renderAccountReport } from "../src/services/account-report.ts";
import { setAppState } from "../src/state/state.ts";

function makeFakeDom(filterAccount = "") {
  const container: any = { innerHTML: "", onclick: null, onchange: null };
  const filterAccountSelect: any = { value: filterAccount };
  (globalThis as any).document = {
    getElementById(id: string) {
      if (id === "account-report-container") return container;
      if (id === "filter-report-account") return filterAccountSelect;
      return null;
    }
  };
  return { container, filterAccountSelect };
}

function baseState(overrides: any = {}) {
  return {
    settings: {
      theme: "dark",
      rooms: [],
      departments: [],
      accounts: [{ code: "ACC-1", description: "Compte 1" }],
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

function resetAccountReportState() {
  accountReportState.sortKey = "id";
  accountReportState.sortOrder = "asc";
  accountReportState.pageSize = 10;
  accountReportState.pages = {};
}

test("renderAccountReport surfaces distributions on unconfigured account codes as 'Compte inconnu'", () => {
  resetAccountReportState();
  const { container } = makeFakeDom();

  setAppState(
    baseState({
      activities: [
        {
          id: "act-1",
          name: "Activité A",
          date_start: "2025-08-01",
          department: "DG",
          distributions: [{ account_code: "ORPHAN-1", amount: 100, reference: "R1", details: "" }]
        }
      ]
    })
  );

  renderAccountReport();
  assert.ok(container.innerHTML.includes("ORPHAN-1"));
  assert.ok(container.innerHTML.includes("Compte inconnu"));
});

test("renderAccountReport excludes activities outside the selected period, blank activities and deleted activities", () => {
  resetAccountReportState();
  const { container } = makeFakeDom();

  setAppState(
    baseState({
      activities: [
        {
          id: "act-in-period",
          name: "Dans la période",
          date_start: "2025-08-01", // Q1 of 2025-2026
          department: "DG",
          distributions: [{ account_code: "ACC-1", amount: 100, reference: "", details: "" }]
        },
        {
          id: "act-out-of-period",
          name: "Hors période",
          date_start: "2024-08-01", // different fiscal year
          department: "DG",
          distributions: [{ account_code: "ACC-1", amount: 999, reference: "", details: "" }]
        },
        {
          id: "act-blank",
          name: "",
          date_start: "2025-08-01",
          department: "DG",
          distributions: [{ account_code: "ACC-1", amount: 999, reference: "", details: "" }]
        },
        {
          id: "act-deleted",
          name: "Supprimée",
          date_start: "2025-08-01",
          department: "DG",
          deleted: true,
          distributions: [{ account_code: "ACC-1", amount: 999, reference: "", details: "" }]
        }
      ]
    })
  );

  renderAccountReport();
  assert.ok(container.innerHTML.includes("act-in-period"));
  assert.ok(!container.innerHTML.includes("act-out-of-period"));
  assert.ok(!container.innerHTML.includes("act-blank"));
  assert.ok(!container.innerHTML.includes("act-deleted"));
  // Only the in-period entry's amount should be in the account total
  assert.ok(container.innerHTML.includes("100,00"));
});

test("renderAccountReport sorts entries by amount ascending/descending", () => {
  resetAccountReportState();
  const { container } = makeFakeDom();

  setAppState(
    baseState({
      activities: [
        {
          id: "act-low",
          name: "Petit montant",
          date_start: "2025-08-01",
          department: "DG",
          distributions: [{ account_code: "ACC-1", amount: 10, reference: "", details: "" }]
        },
        {
          id: "act-high",
          name: "Gros montant",
          date_start: "2025-08-01",
          department: "DG",
          distributions: [{ account_code: "ACC-1", amount: 500, reference: "", details: "" }]
        }
      ]
    })
  );

  accountReportState.sortKey = "amount";
  accountReportState.sortOrder = "asc";
  renderAccountReport();
  assert.ok(container.innerHTML.indexOf("act-low") < container.innerHTML.indexOf("act-high"));

  accountReportState.sortOrder = "desc";
  renderAccountReport();
  assert.ok(container.innerHTML.indexOf("act-high") < container.innerHTML.indexOf("act-low"));
});

test("renderAccountReport paginates each account's entries independently and totals only the current page's account, not the whole entries list", () => {
  resetAccountReportState();
  const { container } = makeFakeDom();

  accountReportState.pageSize = 1;
  accountReportState.pages = { "ACC-1": 2 };

  setAppState(
    baseState({
      activities: [
        {
          id: "act-1",
          name: "Première",
          date_start: "2025-08-01",
          department: "DG",
          distributions: [{ account_code: "ACC-1", amount: 10, reference: "", details: "" }]
        },
        {
          id: "act-2",
          name: "Deuxième",
          date_start: "2025-08-01",
          department: "DG",
          distributions: [{ account_code: "ACC-1", amount: 20, reference: "", details: "" }]
        }
      ]
    })
  );

  accountReportState.sortKey = "id";
  accountReportState.sortOrder = "asc";
  renderAccountReport();

  // Page 2 of a page size of 1, sorted by id asc, shows only the second entry
  assert.ok(!container.innerHTML.includes("act-1<"));
  assert.ok(container.innerHTML.includes("act-2"));
  // The account total still reflects both entries (10 + 20), not just the visible page
  assert.ok(container.innerHTML.includes("30,00"));
});

export {};
