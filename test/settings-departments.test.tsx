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
import { DepartmentsPanel, DeptModal } from "../src/components/settings/departments.tsx";

function baseState(overrides: any = {}) {
  return {
    settings: {
      theme: "dark",
      rooms: [],
      departments: ["ACEECJ", "BICQ"],
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
  document.body.innerHTML = `<div id="toast-container"></div>`;
  (globalThis as any).confirm = () => true;
});

test.afterEach(() => cleanup());

test("DepartmentsPanel renders all departments from settings", () => {
  const { getByText } = render(<DepartmentsPanel active={true} openModal={() => {}} bump={() => {}} />);
  assert.ok(getByText("ACEECJ"));
  assert.ok(getByText("BICQ"));
});

test("clicking add department button calls openModal with null", () => {
  let modalArg: string | null | undefined = undefined;
  const { getByText } = render(<DepartmentsPanel active={true} openModal={(arg) => { modalArg = arg; }} bump={() => {}} />);
  
  fireEvent.click(getByText("+ Ajouter un département"));
  assert.equal(modalArg, null);
});

test("clicking a department item calls openModal with its name", () => {
  let modalArg: string | null | undefined = undefined;
  const { getByText } = render(<DepartmentsPanel active={true} openModal={(arg) => { modalArg = arg; }} bump={() => {}} />);
  
  fireEvent.click(getByText("ACEECJ"));
  assert.equal(modalArg, "ACEECJ");
});

test("clicking delete icon asks for confirmation, removes the department and bumps", async () => {
  let bumped = false;
  const { container } = render(<DepartmentsPanel active={true} openModal={() => {}} bump={() => { bumped = true; }} />);
  
  const deleteBtn = container.querySelector(".btn-icon");
  assert.ok(deleteBtn);
  fireEvent.click(deleteBtn!);

  await waitFor(() => assert.ok(bumped));
  assert.deepEqual(appState.settings.departments, ["BICQ"]);
});

test("declining delete confirmation leaves departments untouched", () => {
  (globalThis as any).confirm = () => false;
  let bumped = false;
  const { container } = render(<DepartmentsPanel active={true} openModal={() => { bumped = true; }} bump={() => {}} />);
  
  const deleteBtn = container.querySelector(".btn-icon");
  assert.ok(deleteBtn);
  fireEvent.click(deleteBtn!);

  assert.equal(bumped, false);
  assert.deepEqual(appState.settings.departments, ["ACEECJ", "BICQ"]);
});

test("DeptModal adds a new valid department and closes", async () => {
  let closed = false;
  let bumped = false;
  const { container } = render(<DeptModal name={null} onClose={() => { closed = true; }} bump={() => { bumped = true; }} />);
  
  const input = container.querySelector("#form-dept-name") as HTMLInputElement;
  assert.ok(input);
  fireEvent.change(input, { target: { value: "NOUVEAU" } });
  
  fireEvent.click(container.querySelector('.modal-footer button[type="button"].btn-primary')!);
  
  await waitFor(() => assert.ok(closed));
  assert.ok(bumped);
  assert.ok(appState.settings.departments.includes("NOUVEAU"));
});

test("DeptModal rejects empty name", () => {
  const { container } = render(<DeptModal name={null} onClose={() => {}} bump={() => {}} />);
  fireEvent.click(container.querySelector('.modal-footer button[type="button"].btn-primary')!);
  
  assert.equal(appState.settings.departments.length, 2);
  const toast = document.querySelector("#toast-container .toast-message");
  assert.ok(toast);
  assert.match(toast!.textContent!, /obligatoire/);
});

test("DeptModal rejects duplicate name (case-insensitive)", () => {
  const { container } = render(<DeptModal name={null} onClose={() => {}} bump={() => {}} />);
  
  const input = container.querySelector("#form-dept-name") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "aceecj" } });
  
  fireEvent.click(container.querySelector('.modal-footer button[type="button"].btn-primary')!);
  
  assert.equal(appState.settings.departments.length, 2);
  const toast = document.querySelector("#toast-container .toast-message");
  assert.ok(toast);
  assert.match(toast!.textContent!, /existe déjà/);
});

test("DeptModal edits department name and propagates to matching activities", async () => {
  setAppState(baseState({
    activities: [
      { id: "act-1", name: "Activité 1", department: "ACEECJ" },
      { id: "act-2", name: "Activité 2", department: "BICQ" }
    ]
  }));
  
  let closed = false;
  const { container } = render(<DeptModal name="ACEECJ" onClose={() => { closed = true; }} bump={() => {}} />);
  
  const input = container.querySelector("#form-dept-name") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "ACEECJ_MODIFIED" } });
  
  fireEvent.click(container.querySelector('.modal-footer button[type="button"].btn-primary')!);
  
  await waitFor(() => assert.ok(closed));
  assert.ok(appState.settings.departments.includes("ACEECJ_MODIFIED"));
  assert.ok(!appState.settings.departments.includes("ACEECJ"));
  
  assert.equal(appState.activities[0].department, "ACEECJ_MODIFIED");
  assert.equal(appState.activities[1].department, "BICQ");
});
