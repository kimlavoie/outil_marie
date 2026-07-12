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

import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { setAppState, appState } from "../src/state/state.ts";
import { SalariesPanel, SalaryModal } from "../src/components/settings/salaries.tsx";

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

function salary(overrides: any = {}) {
  return {
    id: "sal-1",
    job: "Technicien de scène",
    tarifs: [{ id: "t1", label: "Standard", gl_account_code: "", rate_versions: [{ id: "rv1", effective_date: "", rate: 25, overtime_rate: 0 }] }],
    ...overrides
  };
}

test.beforeEach(() => {
  setAppState(baseState());
  document.body.innerHTML = `<div id="toast-container"></div>`;
  (globalThis as any).confirm = () => true;
});

test.afterEach(() => cleanup());

test("SalariesPanel renders one row per salary with its current hourly rate", () => {
  setAppState(baseState({ settings: { ...appState.settings, salaries: [salary()] } }));
  const { getByText } = render(<SalariesPanel active={true} openModal={() => {}} bump={() => {}} />);
  assert.ok(getByText("Technicien de scène"));
  assert.ok(getByText(/25\.00 \$ \/ heure/));
});

test("SalariesPanel shows the overtime rate note when an overtime rate is set", () => {
  setAppState(
    baseState({
      settings: {
        ...appState.settings,
        salaries: [salary({ tarifs: [{ id: "t1", label: "Standard", gl_account_code: "", rate_versions: [{ id: "rv1", effective_date: "", rate: 25, overtime_rate: 37.5 }] }] })]
      }
    })
  );
  const { getByText } = render(<SalariesPanel active={true} openModal={() => {}} bump={() => {}} />);
  assert.ok(getByText(/temps sup\./));
});

test("clicking the delete icon asks for confirmation, then removes the salary and saves", async () => {
  setAppState(baseState({ settings: { ...appState.settings, salaries: [salary()] } }));
  let bumped = false;
  const { container } = render(<SalariesPanel active={true} openModal={() => {}} bump={() => (bumped = true)} />);

  fireEvent.click(container.querySelector(".btn-icon")!);

  await waitFor(() => assert.ok(bumped));
  assert.equal(appState.settings.salaries.length, 0);
});

test("declining the confirmation leaves the salary list untouched", () => {
  setAppState(baseState({ settings: { ...appState.settings, salaries: [salary()] } }));
  (globalThis as any).confirm = () => false;
  const { container } = render(<SalariesPanel active={true} openModal={() => {}} bump={() => {}} />);

  fireEvent.click(container.querySelector(".btn-icon")!);

  assert.equal(appState.settings.salaries.length, 1);
});

test("SalaryModal adding a new job with a valid rate persists it to appState.settings.salaries, sorted by job name", async () => {
  setAppState(baseState({ settings: { ...appState.settings, salaries: [salary({ id: "sal-existing", job: "Zamboni" })] } }));
  let closed = false;
  const { container } = render(<SalaryModal id={null} onClose={() => (closed = true)} bump={() => {}} />);

  fireEvent.change(container.querySelector("#form-salary-job")!, { target: { value: "Accueil" } });
  const numberInputs = container.querySelectorAll('input[type="number"]');
  fireEvent.change(numberInputs[0], { target: { value: "18" } });

  fireEvent.click(container.querySelector('.modal-footer button[type="button"].btn-primary')!);

  await waitFor(() => assert.ok(closed));
  assert.equal(appState.settings.salaries.length, 2);
  assert.equal(appState.settings.salaries[0].job, "Accueil");
  assert.equal(appState.settings.salaries[0].tarifs[0].rate_versions[0].rate, 18);
});

test("SalaryModal rejects an empty job name without persisting", () => {
  const { container } = render(<SalaryModal id={null} onClose={() => {}} bump={() => {}} />);
  fireEvent.click(container.querySelector('.modal-footer button[type="button"].btn-primary')!);
  assert.equal(appState.settings.salaries.length, 0);
});

test("SalaryModal rejects a duplicate job name (case-insensitive)", () => {
  setAppState(baseState({ settings: { ...appState.settings, salaries: [salary({ job: "Technicien" })] } }));
  const { container } = render(<SalaryModal id={null} onClose={() => {}} bump={() => {}} />);

  fireEvent.change(container.querySelector("#form-salary-job")!, { target: { value: "technicien" } });
  fireEvent.change(container.querySelector('input[type="number"]')!, { target: { value: "20" } });
  fireEvent.click(container.querySelector('.modal-footer button[type="button"].btn-primary')!);

  assert.equal(appState.settings.salaries.length, 1);
  const toast = document.querySelector("#toast-container .toast-message");
  assert.ok(toast);
  assert.match(toast!.textContent!, /existe déjà/);
});

test("SalaryModal editing an existing salary updates it in place instead of duplicating", async () => {
  setAppState(baseState({ settings: { ...appState.settings, salaries: [salary()] } }));
  const { container } = render(<SalaryModal id="sal-1" onClose={() => {}} bump={() => {}} />);

  const jobInput = container.querySelector("#form-salary-job") as HTMLInputElement;
  assert.equal(jobInput.value, "Technicien de scène");
  fireEvent.change(jobInput, { target: { value: "Technicien senior" } });
  fireEvent.click(container.querySelector('.modal-footer button[type="button"].btn-primary')!);

  await waitFor(() => assert.equal(appState.settings.salaries.length, 1));
  assert.equal(appState.settings.salaries[0].job, "Technicien senior");
  assert.equal(appState.settings.salaries[0].id, "sal-1");
});

test("SalaryModal rejects a negative overtime rate", () => {
  const { container } = render(<SalaryModal id={null} onClose={() => {}} bump={() => {}} />);
  fireEvent.change(container.querySelector("#form-salary-job")!, { target: { value: "Test" } });
  const numberInputs = container.querySelectorAll('input[type="number"]');
  fireEvent.change(numberInputs[0], { target: { value: "20" } });
  fireEvent.change(numberInputs[1], { target: { value: "-5" } });
  fireEvent.click(container.querySelector('.modal-footer button[type="button"].btn-primary')!);

  assert.equal(appState.settings.salaries.length, 0);
  const toast = document.querySelector("#toast-container .toast-message");
  assert.ok(toast);
  assert.match(toast!.textContent!, /temps supplémentaire valide/);
});

export {};
