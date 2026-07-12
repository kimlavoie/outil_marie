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
import { GlobalTasksPanel, GlobalTaskModal } from "../src/components/settings/global-tasks.tsx";

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
      global_tasks: [
        { id: "gt-1", description: "Vérifier l'équipement audio" },
        { id: "gt-2", description: "Envoyer confirmation client" }
      ],
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

test("GlobalTasksPanel renders all global tasks", () => {
  const { getByText } = render(<GlobalTasksPanel active={true} openModal={() => {}} bump={() => {}} />);
  assert.ok(getByText("Vérifier l'équipement audio"));
  assert.ok(getByText("Envoyer confirmation client"));
});

test("clicking add global task button calls openModal with null", () => {
  let modalId: string | null | undefined = undefined;
  const { getByText } = render(<GlobalTasksPanel active={true} openModal={(id) => { modalId = id; }} bump={() => {}} />);
  
  fireEvent.click(getByText("+ Ajouter une tâche globale"));
  assert.equal(modalId, null);
});

test("clicking a task item calls openModal with its id", () => {
  let modalId: string | null | undefined = undefined;
  const { getByText } = render(<GlobalTasksPanel active={true} openModal={(id) => { modalId = id; }} bump={() => {}} />);
  
  fireEvent.click(getByText("Vérifier l'équipement audio"));
  assert.equal(modalId, "gt-1");
});

test("clicking delete icon asks for confirmation, removes the global task and bumps", async () => {
  let bumped = false;
  const { container } = render(<GlobalTasksPanel active={true} openModal={() => {}} bump={() => { bumped = true; }} />);
  
  const deleteBtn = container.querySelector(".btn-icon");
  assert.ok(deleteBtn);
  fireEvent.click(deleteBtn!);

  await waitFor(() => assert.ok(bumped));
  assert.equal(appState.settings.global_tasks.length, 1);
  assert.equal(appState.settings.global_tasks[0].id, "gt-2");
});

test("declining delete confirmation leaves global tasks untouched", () => {
  (globalThis as any).confirm = () => false;
  let bumped = false;
  const { container } = render(<GlobalTasksPanel active={true} openModal={() => {}} bump={() => { bumped = true; }} />);
  
  const deleteBtn = container.querySelector(".btn-icon");
  assert.ok(deleteBtn);
  fireEvent.click(deleteBtn!);

  assert.equal(bumped, false);
  assert.equal(appState.settings.global_tasks.length, 2);
});

test("GlobalTaskModal adds a new global task and closes", async () => {
  let closed = false;
  let bumped = false;
  const { container } = render(<GlobalTaskModal id={null} onClose={() => { closed = true; }} bump={() => { bumped = true; }} />);
  
  const input = container.querySelector("#form-global-task-desc") as HTMLInputElement;
  assert.ok(input);
  fireEvent.change(input, { target: { value: "Préparer le contrat" } });
  
  fireEvent.click(container.querySelector('.modal-footer button[type="button"].btn-primary')!);
  
  await waitFor(() => assert.ok(closed));
  assert.ok(bumped);
  assert.equal(appState.settings.global_tasks.length, 3);
  assert.ok(appState.settings.global_tasks.some(t => t.description === "Préparer le contrat"));
});

test("GlobalTaskModal rejects empty description", () => {
  const { container } = render(<GlobalTaskModal id={null} onClose={() => {}} bump={() => {}} />);
  fireEvent.click(container.querySelector('.modal-footer button[type="button"].btn-primary')!);
  
  assert.equal(appState.settings.global_tasks.length, 2);
  const toast = document.querySelector("#toast-container .toast-message");
  assert.ok(toast);
  assert.match(toast!.textContent!, /saisir une description/);
});

test("GlobalTaskModal edits description of existing task", async () => {
  let closed = false;
  const { container } = render(<GlobalTaskModal id="gt-1" onClose={() => { closed = true; }} bump={() => {}} />);
  
  const input = container.querySelector("#form-global-task-desc") as HTMLInputElement;
  assert.equal(input.value, "Vérifier l'équipement audio");
  fireEvent.change(input, { target: { value: "Vérifier l'équipement audio (modifié)" } });
  
  fireEvent.click(container.querySelector('.modal-footer button[type="button"].btn-primary')!);
  
  await waitFor(() => assert.ok(closed));
  assert.equal(appState.settings.global_tasks[0].description, "Vérifier l'équipement audio (modifié)");
  assert.equal(appState.settings.global_tasks.length, 2);
});
