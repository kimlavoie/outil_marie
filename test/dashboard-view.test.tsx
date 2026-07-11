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

import { render, cleanup, fireEvent } from "@testing-library/react";
import { setAppState } from "../src/state/state.ts";
import { reconciliationState } from "../src/services/reconciliation.ts";
import { DashboardView } from "../src/components/dashboard-view.tsx";

const YEAR = "2025-2026";
const ALL_QUARTERS = [1, 2, 3, 4];

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
    selected_year: YEAR,
    selected_quarters: ALL_QUARTERS,
    ...overrides
  };
}

function activity(overrides: any = {}) {
  return {
    id: "act-1",
    name: "Activité test",
    date_start: "2025-08-01",
    client_type: "externe",
    distributions: [],
    reservations: [],
    deleted: false,
    ...overrides
  };
}

test.beforeEach(() => {
  setAppState(baseState());
  reconciliationState.results = [];
  document.body.innerHTML = "";
});

test.afterEach(() => cleanup());

test("renders the KPI stat cards from computeDashboardStats", () => {
  setAppState(
    baseState({
      activities: [activity({ distributions: [{ amount: 100 }, { amount: 50 }] }), activity({ id: "act-2", name: "", distributions: [{ amount: 999 }] })]
    })
  );

  const { container } = render(<DashboardView />);

  const values = Array.from(container.querySelectorAll(".stat-value")).map(el => el.textContent);
  assert.equal(values[2], "1"); // filledCount: blank activity excluded
  assert.match(values[0]!, /150,00/); // totalRevenue formatted as currency
});

test("shows the reconciliation rate computed from reconciliationState.results", () => {
  reconciliationState.results = [
    { status: "valid" },
    { status: "valid" },
    { status: "diff" },
    { status: "unentered" } // excluded from the denominator
  ];

  const { container } = render(<DashboardView />);
  const values = Array.from(container.querySelectorAll(".stat-value")).map(el => el.textContent);
  assert.equal(values[3], "67%"); // 2 valid / 3 app-side records, rounded
});

test("renders one canvas per chart (quarterly revenue, room share, accounts volume)", () => {
  const { container } = render(<DashboardView />);
  assert.equal(container.querySelectorAll("canvas").length, 3);
});

test("shows a prompt instead of employee stats when no salary is configured", () => {
  const { container, getByText } = render(<DashboardView />);
  assert.equal(container.querySelector("select.select-input")!.textContent, "Choisir un employé / emploi...");
  getByText("Veuillez sélectionner un employé ou emploi pour afficher les statistiques correspondantes.");
});

test("auto-selects the first configured salary and shows its stats by default", () => {
  setAppState(
    baseState({
      settings: {
        ...baseState().settings,
        salaries: [
          { id: "sal-1", job: "Technicien", tarifs: [{ id: "t1", rate_versions: [{ effective_date: "", rate: 25 }] }] },
          { id: "sal-2", job: "Régisseur", tarifs: [{ id: "t1", rate_versions: [{ effective_date: "", rate: 30 }] }] }
        ]
      },
      activities: [
        activity({
          reservations: [{ staff: [{ salary_id: "sal-1", tarif_id: "t1", hours: 4, count: 1, overtime_hours: 0 }] }]
        })
      ]
    })
  );

  const { container } = render(<DashboardView />);
  const select = container.querySelector("select.select-input") as HTMLSelectElement;
  assert.equal(select.value, "sal-1");
  const empStatsGrid = container.querySelectorAll(".stats-grid")[1];
  assert.match(empStatsGrid.querySelectorAll(".stat-value")[0].textContent!, /4.0 h/); // 4h x 1 count
});

test("switching the employee select updates the displayed stats", () => {
  setAppState(
    baseState({
      settings: {
        ...baseState().settings,
        salaries: [
          { id: "sal-1", job: "Technicien", tarifs: [{ id: "t1", rate_versions: [{ effective_date: "", rate: 25 }] }] },
          { id: "sal-2", job: "Régisseur", tarifs: [{ id: "t1", rate_versions: [{ effective_date: "", rate: 40 }] }] }
        ]
      },
      activities: [
        activity({
          id: "act-1",
          reservations: [{ staff: [{ salary_id: "sal-1", tarif_id: "t1", hours: 4, count: 1, overtime_hours: 0 }] }]
        }),
        activity({
          id: "act-2",
          reservations: [{ staff: [{ salary_id: "sal-2", tarif_id: "t1", hours: 2, count: 1, overtime_hours: 0 }] }]
        })
      ]
    })
  );

  const { container } = render(<DashboardView />);
  const select = container.querySelector("select.select-input") as HTMLSelectElement;

  fireEvent.change(select, { target: { value: "sal-2" } });

  assert.equal(select.value, "sal-2");
  const amountCell = container.querySelector(".stat-value[style*='--info']");
  assert.match(amountCell!.textContent!, /80,00/); // 2h x 40$
});

test("shows 'Aucune activité facturée' when the selected employee has no contributing activities", () => {
  setAppState(
    baseState({
      settings: {
        ...baseState().settings,
        salaries: [{ id: "sal-1", job: "Technicien", tarifs: [{ id: "t1", rate_versions: [{ effective_date: "", rate: 25 }] }] }]
      },
      activities: []
    })
  );

  const { getByText } = render(<DashboardView />);
  getByText("Aucune activité facturée dans cette période.");
});

test("lists one row per selected quarter, with the correct hours/amount aggregated per quarter", () => {
  setAppState(
    baseState({
      settings: {
        ...baseState().settings,
        salaries: [{ id: "sal-1", job: "Technicien", tarifs: [{ id: "t1", rate_versions: [{ effective_date: "", rate: 10 }] }] }]
      },
      selected_quarters: [1, 2],
      activities: [
        activity({
          id: "act-q1",
          date_start: "2025-08-01", // Q1
          reservations: [{ staff: [{ salary_id: "sal-1", tarif_id: "t1", hours: 3, count: 1, overtime_hours: 0 }] }]
        }),
        activity({
          id: "act-q2",
          date_start: "2025-11-01", // Q2
          reservations: [{ staff: [{ salary_id: "sal-1", tarif_id: "t1", hours: 5, count: 1, overtime_hours: 1 }] }]
        })
      ]
    })
  );

  const { container } = render(<DashboardView />);
  const rows = container.querySelectorAll(".table-responsive")[0].querySelectorAll("tbody tr");
  assert.equal(rows.length, 2);
  assert.match(rows[0].textContent!, /Trimestre 1/);
  assert.match(rows[0].textContent!, /3.0 h/);
  assert.match(rows[1].textContent!, /Trimestre 2/);
  assert.match(rows[1].textContent!, /5.0 h/);
  assert.match(rows[1].textContent!, /1.0 h/);
});

test("lists the contributing activities detail table, most recent first", () => {
  setAppState(
    baseState({
      settings: {
        ...baseState().settings,
        salaries: [{ id: "sal-1", job: "Technicien", tarifs: [{ id: "t1", rate_versions: [{ effective_date: "", rate: 10 }] }] }]
      },
      activities: [
        activity({
          id: "act-early",
          name: "Activité de août",
          date_start: "2025-08-01",
          reservations: [{ staff: [{ salary_id: "sal-1", tarif_id: "t1", hours: 2, count: 1, overtime_hours: 0 }] }]
        }),
        activity({
          id: "act-late",
          name: "Activité de décembre",
          date_start: "2025-12-01",
          reservations: [{ staff: [{ salary_id: "sal-1", tarif_id: "t1", hours: 3, count: 1, overtime_hours: 0 }] }]
        })
      ]
    })
  );

  const { container } = render(<DashboardView />);
  const detailRows = container.querySelectorAll(".table-responsive")[1].querySelectorAll("tbody tr");
  assert.equal(detailRows.length, 2);
  assert.match(detailRows[0].textContent!, /Activité de décembre/);
  assert.match(detailRows[1].textContent!, /Activité de août/);
});

export {};
