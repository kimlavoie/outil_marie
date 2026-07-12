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
(globalThis as any).confirm = () => true;

import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { appState, setAppState } from "../src/state/state.ts";
import { AccountsPanel, AccountModal } from "../src/components/settings/accounts.tsx";

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
});

test.afterEach(() => cleanup());

test("AccountsPanel lists every account with its code and description", () => {
  setAppState(baseState({
    settings: {
      ...baseState().settings,
      accounts: [
        { code: "892-9020-00-849", description: "SCOLAIRE" },
        { code: "892-9020-00-850", description: "PRIVE" }
      ]
    }
  }));

  const { container } = render(<AccountsPanel active openModal={() => {}} bump={() => {}} />);
  const items = container.querySelectorAll(".settings-list-item");
  assert.equal(items.length, 2);
  assert.match(items[0].textContent || "", /892-9020-00-849/);
  assert.match(items[0].textContent || "", /SCOLAIRE/);
  assert.match(items[1].textContent || "", /892-9020-00-850/);
});

test("AccountsPanel opens the modal for a new account when + Ajouter un compte is clicked", () => {
  let openedWith: string | null | undefined = "not-called";
  const { getByText } = render(<AccountsPanel active openModal={code => (openedWith = code)} bump={() => {}} />);
  fireEvent.click(getByText("+ Ajouter un compte"));
  assert.equal(openedWith, null);
});

test("clicking the delete button on an account asks for confirmation then removes it", async () => {
  setAppState(baseState({
    settings: {
      ...baseState().settings,
      accounts: [{ code: "892-9020-00-849", description: "SCOLAIRE" }]
    }
  }));
  let bumped = false;
  const { container } = render(<AccountsPanel active openModal={() => {}} bump={() => (bumped = true)} />);
  const deleteBtn = container.querySelector(".btn-icon") as HTMLButtonElement;
  fireEvent.click(deleteBtn);

  await waitFor(() => assert.equal(bumped, true));
  assert.equal(appState.settings.accounts.length, 0);
});

test("clicking an account row invokes openModal with that account's code", () => {
  setAppState(baseState({
    settings: {
      ...baseState().settings,
      accounts: [{ code: "892-9020-00-849", description: "SCOLAIRE" }]
    }
  }));
  let opened: string | null | undefined;
  const { container } = render(<AccountsPanel active openModal={code => (opened = code)} bump={() => {}} />);
  fireEvent.click(container.querySelector(".settings-list-item") as HTMLElement);
  assert.equal(opened, "892-9020-00-849");
});

test("AccountModal pre-fills code and description when editing an existing account", () => {
  setAppState(baseState({
    settings: {
      ...baseState().settings,
      accounts: [{ code: "892-9020-00-849", description: "SCOLAIRE" }]
    }
  }));
  const { container } = render(<AccountModal code="892-9020-00-849" onClose={() => {}} bump={() => {}} />);
  const codeInput = container.querySelector("#form-account-code") as HTMLInputElement;
  const descInput = container.querySelector("#form-account-desc") as HTMLInputElement;
  assert.equal(codeInput.value, "892-9020-00-849");
  assert.equal(descInput.value, "SCOLAIRE");
});

test("AccountModal starts blank when adding a new account", () => {
  const { container } = render(<AccountModal code={null} onClose={() => {}} bump={() => {}} />);
  const codeInput = container.querySelector("#form-account-code") as HTMLInputElement;
  const descInput = container.querySelector("#form-account-desc") as HTMLInputElement;
  assert.equal(codeInput.value, "");
  assert.equal(descInput.value, "");
});

test("submitting a malformed account code shows a validation warning and doesn't save", () => {
  const { container, getByText } = render(<AccountModal code={null} onClose={() => {}} bump={() => {}} />);
  const codeInput = container.querySelector("#form-account-code") as HTMLInputElement;
  const descInput = container.querySelector("#form-account-desc") as HTMLInputElement;
  fireEvent.change(codeInput, { target: { value: "not-a-code" } });
  fireEvent.change(descInput, { target: { value: "Test" } });
  fireEvent.click(getByText("Enregistrer"));

  assert.equal(appState.settings.accounts.length, 0);
});

test("submitting an account with an empty description shows a validation warning and doesn't save", () => {
  const { container, getByText } = render(<AccountModal code={null} onClose={() => {}} bump={() => {}} />);
  const codeInput = container.querySelector("#form-account-code") as HTMLInputElement;
  fireEvent.change(codeInput, { target: { value: "892-9020-00-849" } });
  fireEvent.click(getByText("Enregistrer"));

  assert.equal(appState.settings.accounts.length, 0);
});

test("submitting a valid new account adds it, sorted, and closes the modal", async () => {
  setAppState(baseState({
    settings: {
      ...baseState().settings,
      accounts: [{ code: "892-9020-00-999", description: "ZULU" }]
    }
  }));
  let closed = false;
  const { container, getByText } = render(<AccountModal code={null} onClose={() => (closed = true)} bump={() => {}} />);
  const codeInput = container.querySelector("#form-account-code") as HTMLInputElement;
  const descInput = container.querySelector("#form-account-desc") as HTMLInputElement;
  fireEvent.change(codeInput, { target: { value: "892-9020-00-100" } });
  fireEvent.change(descInput, { target: { value: "ALPHA" } });
  fireEvent.click(getByText("Enregistrer"));

  await waitFor(() => assert.equal(closed, true));
  assert.equal(appState.settings.accounts.length, 2);
  assert.equal(appState.settings.accounts[0].code, "892-9020-00-100");
});

test("submitting a duplicate account code (new account) shows a warning and doesn't add a second entry", () => {
  setAppState(baseState({
    settings: {
      ...baseState().settings,
      accounts: [{ code: "892-9020-00-849", description: "SCOLAIRE" }]
    }
  }));
  const { container, getByText } = render(<AccountModal code={null} onClose={() => {}} bump={() => {}} />);
  const codeInput = container.querySelector("#form-account-code") as HTMLInputElement;
  const descInput = container.querySelector("#form-account-desc") as HTMLInputElement;
  fireEvent.change(codeInput, { target: { value: "892-9020-00-849" } });
  fireEvent.change(descInput, { target: { value: "DUPLICATE" } });
  fireEvent.click(getByText("Enregistrer"));

  assert.equal(appState.settings.accounts.length, 1);
  assert.equal(appState.settings.accounts[0].description, "SCOLAIRE");
});

test("editing an existing account updates it in place and propagates the code change to linked distributions", async () => {
  setAppState(baseState({
    settings: {
      ...baseState().settings,
      accounts: [{ code: "892-9020-00-849", description: "SCOLAIRE" }]
    },
    activities: [
      {
        id: "act-1",
        distributions: [{ account_code: "892-9020-00-849", amount: 100 }]
      }
    ]
  }));
  let closed = false;
  const { container, getByText } = render(<AccountModal code="892-9020-00-849" onClose={() => (closed = true)} bump={() => {}} />);
  const codeInput = container.querySelector("#form-account-code") as HTMLInputElement;
  fireEvent.change(codeInput, { target: { value: "892-9020-00-900" } });
  fireEvent.click(getByText("Enregistrer"));

  await waitFor(() => assert.equal(closed, true));
  assert.equal(appState.settings.accounts[0].code, "892-9020-00-900");
  assert.equal(appState.activities[0].distributions[0].account_code, "892-9020-00-900");
});

export {};
