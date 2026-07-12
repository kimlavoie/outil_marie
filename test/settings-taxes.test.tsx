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
import { TaxesPanel } from "../src/components/settings/taxes.tsx";

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
      schedulable_tasks: [],
      tax_rates: { tps: 0.05, tvq: 0.09975 }
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
});

test.afterEach(() => cleanup());

test("TaxesPanel renders with default / current values", () => {
  const { container } = render(<TaxesPanel active={true} />);
  
  const tpsInput = container.querySelector("#form-tax-rate-tps") as HTMLInputElement;
  const tvqInput = container.querySelector("#form-tax-rate-tvq") as HTMLInputElement;
  
  assert.equal(tpsInput.value, "5");
  assert.equal(tvqInput.value, "9.975");
});

test("TaxesPanel supports custom tax rates and saves them", async () => {
  const { container, getByText } = render(<TaxesPanel active={true} />);
  
  const tpsInput = container.querySelector("#form-tax-rate-tps") as HTMLInputElement;
  const tvqInput = container.querySelector("#form-tax-rate-tvq") as HTMLInputElement;
  
  fireEvent.change(tpsInput, { target: { value: "6.5" } });
  fireEvent.change(tvqInput, { target: { value: "10.25" } });
  
  fireEvent.click(getByText("Enregistrer"));
  
  await waitFor(() => {
    const toast = document.querySelector("#toast-container .toast-message");
    assert.ok(toast);
    assert.match(toast!.textContent!, /Taux de taxes enregistrés/);
  });
});

test("TaxesPanel rejects invalid or negative rates", () => {
  const { container, getByText } = render(<TaxesPanel active={true} />);
  
  const tpsInput = container.querySelector("#form-tax-rate-tps") as HTMLInputElement;
  fireEvent.change(tpsInput, { target: { value: "-1" } });
  
  fireEvent.click(getByText("Enregistrer"));
  
  assert.deepEqual(appState.settings.tax_rates, { tps: 0.05, tvq: 0.09975 });
  
  const toast = document.querySelector("#toast-container .toast-message");
  assert.ok(toast);
  assert.match(toast!.textContent!, /Les taux doivent être des nombres valides/);
});
