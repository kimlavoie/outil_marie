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
import { ServicesPanel, ServiceModal } from "../src/components/settings/services.tsx";

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

function service(overrides: any = {}) {
  return {
    id: "svc-1",
    name: "Location d'écran",
    type: "fixed",
    tarifs: [{ id: "t1", label: "Standard", gl_account_code: "", rate_versions: [{ id: "rv1", effective_date: "", rate: 100 }] }],
    ...overrides
  };
}

test.beforeEach(() => {
  setAppState(baseState());
  document.body.innerHTML = `<div id="toast-container"></div>`;
  (globalThis as any).confirm = () => true;
});

test.afterEach(() => cleanup());

test("ServicesPanel renders one row per service with its current rate", () => {
  setAppState(baseState({ settings: { ...appState.settings, services: [service()] } }));
  const { getByText } = render(<ServicesPanel active={true} openModal={() => {}} bump={() => {}} />);
  assert.ok(getByText("Location d'écran"));
  assert.ok(getByText(/100\.00 \$/));
});

test("ServicesPanel shows the hourly unit for hourly services", () => {
  setAppState(baseState({ settings: { ...appState.settings, services: [service({ type: "hourly" })] } }));
  const { getByText } = render(<ServicesPanel active={true} openModal={() => {}} bump={() => {}} />);
  assert.ok(getByText(/\$ \/ heure/));
});

test("clicking the delete icon asks for confirmation, then removes the service and saves", async () => {
  setAppState(baseState({ settings: { ...appState.settings, services: [service()] } }));
  let bumped = false;
  const { container } = render(<ServicesPanel active={true} openModal={() => {}} bump={() => (bumped = true)} />);

  fireEvent.click(container.querySelector(".btn-icon")!);

  await waitFor(() => assert.ok(bumped));
  assert.equal(appState.settings.services.length, 0);
});

test("declining the confirmation leaves the service list untouched", () => {
  setAppState(baseState({ settings: { ...appState.settings, services: [service()] } }));
  (globalThis as any).confirm = () => false;
  const { container } = render(<ServicesPanel active={true} openModal={() => {}} bump={() => {}} />);

  fireEvent.click(container.querySelector(".btn-icon")!);

  assert.equal(appState.settings.services.length, 1);
});

test("ServiceModal adding a new service with a valid name and rate persists it to appState.settings.services", async () => {
  let closed = false;
  const { container } = render(<ServiceModal id={null} onClose={() => (closed = true)} bump={() => {}} />);

  fireEvent.change(container.querySelector("#form-service-name")!, { target: { value: "Nouveau service" } });
  const rateInput = container.querySelector('input[type="number"]') as HTMLInputElement;
  fireEvent.change(rateInput, { target: { value: "42" } });

  fireEvent.click(container.querySelector('.modal-footer button[type="button"].btn-primary')!);

  await waitFor(() => assert.ok(closed));
  assert.equal(appState.settings.services.length, 1);
  assert.equal(appState.settings.services[0].name, "Nouveau service");
  assert.equal(appState.settings.services[0].tarifs[0].rate_versions[0].rate, 42);
});

test("ServiceModal rejects an empty name without persisting", () => {
  const { container } = render(<ServiceModal id={null} onClose={() => {}} bump={() => {}} />);
  fireEvent.click(container.querySelector('.modal-footer button[type="button"].btn-primary')!);
  assert.equal(appState.settings.services.length, 0);
});

test("ServiceModal rejects a duplicate service name (case-insensitive)", () => {
  setAppState(baseState({ settings: { ...appState.settings, services: [service({ name: "Écran" })] } }));
  const { container } = render(<ServiceModal id={null} onClose={() => {}} bump={() => {}} />);

  fireEvent.change(container.querySelector("#form-service-name")!, { target: { value: "écran" } });
  fireEvent.change(container.querySelector('input[type="number"]')!, { target: { value: "10" } });
  fireEvent.click(container.querySelector('.modal-footer button[type="button"].btn-primary')!);

  assert.equal(appState.settings.services.length, 1);
  const toast = document.querySelector("#toast-container .toast-message");
  assert.ok(toast);
  assert.match(toast!.textContent!, /existe déjà/);
});

test("ServiceModal editing an existing service updates it in place instead of duplicating", async () => {
  setAppState(baseState({ settings: { ...appState.settings, services: [service()] } }));
  const { container } = render(<ServiceModal id="svc-1" onClose={() => {}} bump={() => {}} />);

  const nameInput = container.querySelector("#form-service-name") as HTMLInputElement;
  assert.equal(nameInput.value, "Location d'écran");
  fireEvent.change(nameInput, { target: { value: "Location d'écran (modifié)" } });
  fireEvent.click(container.querySelector('.modal-footer button[type="button"].btn-primary')!);

  await waitFor(() => assert.equal(appState.settings.services.length, 1));
  assert.equal(appState.settings.services[0].name, "Location d'écran (modifié)");
  assert.equal(appState.settings.services[0].id, "svc-1");
});

test("ServiceModal rejects a tarif with no valid rate version", () => {
  const { container } = render(<ServiceModal id={null} onClose={() => {}} bump={() => {}} />);
  fireEvent.change(container.querySelector("#form-service-name")!, { target: { value: "Sans tarif" } });
  fireEvent.click(container.querySelector('.modal-footer button[type="button"].btn-primary')!);

  assert.equal(appState.settings.services.length, 0);
  const toast = document.querySelector("#toast-container .toast-message");
  assert.ok(toast);
  assert.match(toast!.textContent!, /au moins un tarif/);
});

export {};
