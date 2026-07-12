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
import { SchedulableTasksPanel, SchedulableTaskModal } from "../src/components/settings/schedulable-tasks.tsx";

function baseState(overrides: any = {}) {
  return {
    settings: {
      theme: "dark",
      rooms: [{ name: "Salle Polyvalente (200.2)" }],
      departments: ["ACEECJ"],
      accounts: [],
      last_backup_date: "",
      backup_reminder_days: 7,
      salaries: [],
      services: [{ id: "svc-1", name: "Location d'écran" }],
      global_tasks: [],
      schedulable_tasks: [
        {
          id: "st-1",
          description: "Tâche automatique de test",
          groups_logic: "AND",
          groups: [
            {
              id: "g1",
              logic: "AND",
              conditions: [
                { id: "c1", field: "event_type", operator: "equals", value: "conference" }
              ]
            }
          ]
        }
      ]
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

test("SchedulableTasksPanel renders list and description", () => {
  const { getByText } = render(<SchedulableTasksPanel active={true} openModal={() => {}} bump={() => {}} />);
  assert.ok(getByText("Tâche automatique de test"));
  assert.ok(getByText(/Si Type d'événement = Conférence/));
});

test("clicking add task button opens modal with null", () => {
  let modalId: string | null | undefined = undefined;
  const { getByText } = render(<SchedulableTasksPanel active={true} openModal={(id) => { modalId = id; }} bump={() => {}} />);
  
  fireEvent.click(getByText("+ Ajouter une tâche programmable"));
  assert.equal(modalId, null);
});

test("clicking list item opens modal with id", () => {
  let modalId: string | null | undefined = undefined;
  const { getByText } = render(<SchedulableTasksPanel active={true} openModal={(id) => { modalId = id; }} bump={() => {}} />);
  
  fireEvent.click(getByText("Tâche automatique de test"));
  assert.equal(modalId, "st-1");
});

test("deleting a task programmable saves changes", async () => {
  let bumped = false;
  const { container } = render(<SchedulableTasksPanel active={true} openModal={() => {}} bump={() => { bumped = true; }} />);
  
  const deleteBtn = container.querySelector(".btn-icon");
  assert.ok(deleteBtn);
  fireEvent.click(deleteBtn!);

  await waitFor(() => assert.ok(bumped));
  assert.equal(appState.settings.schedulable_tasks.length, 0);
});

test("declining delete confirmation leaves tasks untouched", () => {
  (globalThis as any).confirm = () => false;
  let bumped = false;
  const { container } = render(<SchedulableTasksPanel active={true} openModal={() => {}} bump={() => { bumped = true; }} />);
  
  const deleteBtn = container.querySelector(".btn-icon");
  assert.ok(deleteBtn);
  fireEvent.click(deleteBtn!);

  assert.equal(bumped, false);
  assert.equal(appState.settings.schedulable_tasks.length, 1);
});

test("SchedulableTaskModal loads existing task data and handles changes", async () => {
  let closed = false;
  let bumped = false;
  const { container, getByText } = render(
    <SchedulableTaskModal id="st-1" onClose={() => { closed = true; }} bump={() => { bumped = true; }} />
  );

  const input = container.querySelector("#form-schedulable-task-desc") as HTMLInputElement;
  assert.equal(input.value, "Tâche automatique de test");
  
  // Test adding condition
  fireEvent.click(getByText("+ Ajouter une condition"));
  
  // Test adding group
  fireEvent.click(getByText("+ Ajouter un groupe de conditions"));
  
  // Change value/operator
  const selects = container.querySelectorAll("select");
  assert.ok(selects.length > 2);
  
  // Modify description
  fireEvent.change(input, { target: { value: "Tâche automatique modifiée" } });
  
  fireEvent.click(container.querySelector('.modal-footer button[type="button"].btn-primary')!);
  
  await waitFor(() => assert.ok(closed));
  assert.ok(bumped);
  assert.equal(appState.settings.schedulable_tasks[0].description, "Tâche automatique modifiée");
});

test("SchedulableTaskModal rejects empty description", () => {
  const { container } = render(<SchedulableTaskModal id={null} onClose={() => {}} bump={() => {}} />);
  
  fireEvent.click(container.querySelector('.modal-footer button[type="button"].btn-primary')!);
  
  const toast = document.querySelector("#toast-container .toast-message");
  assert.ok(toast);
  assert.match(toast!.textContent!, /saisir une description/);
});

test("SchedulableTaskModal rejects when there are no conditions", () => {
  const { container } = render(<SchedulableTaskModal id="st-1" onClose={() => {}} bump={() => {}} />);
  
  const input = container.querySelector("#form-schedulable-task-desc") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "Tâche sans condition" } });
  
  // Remove the existing condition
  const deleteBtn = container.querySelector(".distribution-row button.btn-icon")!;
  fireEvent.click(deleteBtn);
  
  fireEvent.click(container.querySelector('.modal-footer button[type="button"].btn-primary')!);
  
  const toast = document.querySelector("#toast-container .toast-message");
  assert.ok(toast);
  assert.match(toast!.textContent!, /définir au moins une condition/);
});
