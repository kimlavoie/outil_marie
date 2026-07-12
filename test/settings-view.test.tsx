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
import { SettingsView } from "../src/components/settings/view.tsx";

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
  localStorage.clear();
  document.body.innerHTML = `<div id="toast-container"></div>`;
});

test.afterEach(() => cleanup());

test("SettingsView renders sidebar tabs and default active panel", () => {
  const { getByText } = render(<SettingsView command={{ seq: 0, type: "closeAll" }} />);
  
  assert.ok(getByText("Comptes GL"));
  assert.ok(getByText("Salles & Tarifs"));
  assert.ok(getByText("Départements"));
  
  // Default tab is accounts
  const accountsTab = getByText("Comptes GL");
  assert.ok(accountsTab.className.includes("active"));
});

test("SettingsView switches tabs on click", () => {
  const { getByText } = render(<SettingsView command={{ seq: 0, type: "closeAll" }} />);
  
  const taxesTab = getByText("Taxes", { selector: "button" });
  fireEvent.click(taxesTab);
  
  assert.ok(taxesTab.className.includes("active"));
  
  const savedUi = JSON.parse(localStorage.getItem("outil_marie_settings_ui")!);
  assert.equal(savedUi.tab, "taxes");
});

test("SettingsView responds to commands", async () => {
  const { rerender, getByText } = render(<SettingsView command={{ seq: 1, type: "openPanel", panel: "salaries" }} />);
  
  const salariesTab = getByText("Salaires");
  assert.ok(salariesTab.className.includes("active"));
  
  // Test openAccountModal command
  rerender(<SettingsView command={{ seq: 2, type: "openAccountModal", code: "1234" }} />);
  const accountsTab = getByText("Comptes GL");
  assert.ok(accountsTab.className.includes("active"));
  
  // Test closeAll command
  rerender(<SettingsView command={{ seq: 3, type: "closeAll" }} />);
  const savedUi = JSON.parse(localStorage.getItem("outil_marie_settings_ui")!);
  assert.equal(savedUi.modal, null);
});

test("SettingsView restores initial tab and modal from localStorage", () => {
  localStorage.setItem(
    "outil_marie_settings_ui",
    JSON.stringify({ tab: "departments", modal: { panel: "departments", key: "ACEECJ" } })
  );
  
  const { getByText, container } = render(<SettingsView command={{ seq: 0, type: "closeAll" }} />);
  
  const deptTab = getByText("Départements");
  assert.ok(deptTab.className.includes("active"));
  
  // Modal should be open with the saved department
  const modalTitle = container.querySelector("#dept-modal-title");
  assert.ok(modalTitle);
  assert.match(modalTitle!.textContent!, /Modifier/);
});
