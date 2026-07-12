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

import { useState } from "react";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { setAppState } from "../src/state/state.ts";
import { PricingGridEditor, type PricingGrid } from "../src/components/settings/pricing-grid-editor.tsx";

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

function emptyGrid(overrides: Partial<PricingGrid> = {}): PricingGrid {
  return { id: "grid-1", effective_date: "", parameters: [], client_types: [], cells: [], ...overrides };
}

function Harness({ initialGrids }: { initialGrids: PricingGrid[] }) {
  const [grids, setGrids] = useState<PricingGrid[]>(initialGrids);
  const [activeGridIndex, setActiveGridIndex] = useState(initialGrids.length - 1);
  return (
    <PricingGridEditor grids={grids} setGrids={setGrids} activeGridIndex={activeGridIndex} setActiveGridIndex={setActiveGridIndex} />
  );
}

test.beforeEach(() => {
  setAppState(baseState());
  document.body.innerHTML = `<div id="toast-container"></div>`;
  (globalThis as any).confirm = () => true;
});

test.afterEach(() => cleanup());

test("clicking + Ajouter for configurations adds a new empty parameter row", () => {
  const { container, getAllByText } = render(<Harness initialGrids={[emptyGrid()]} />);
  fireEvent.click(getAllByText("+ Ajouter")[0]);

  const paramInputs = container.querySelectorAll('input[name$="-name"]');
  assert.equal(paramInputs.length, 1);
  assert.equal((paramInputs[0] as HTMLInputElement).value, "");
});

test("clicking + Ajouter for client types adds a new empty client-type row", () => {
  const { getAllByText, container } = render(<Harness initialGrids={[emptyGrid()]} />);
  fireEvent.click(getAllByText("+ Ajouter")[1]);

  const ctInputs = container.querySelectorAll('input[name$="-name"]');
  assert.equal(ctInputs.length, 1);
});

test("typing an amount in the matrix cell stores it against the right parameter/client-type pair", () => {
  const grid = emptyGrid({
    parameters: [{ id: "p1", name: "Spectacle" }],
    client_types: [{ id: "ct1", name: "Interne" }]
  });
  const { container } = render(<Harness initialGrids={[grid]} />);

  const cellInput = container.querySelector('input[name="cell-p1-ct1"]') as HTMLInputElement;
  fireEvent.change(cellInput, { target: { value: "150" } });

  assert.equal(cellInput.value, "150");
});

test("deleting a parameter also removes any matrix cells referencing it", () => {
  const grid = emptyGrid({
    parameters: [{ id: "p1", name: "Spectacle" }],
    client_types: [{ id: "ct1", name: "Interne" }],
    cells: [{ parameter_id: "p1", client_type_id: "ct1", amount: 200 }]
  });
  const { container } = render(<Harness initialGrids={[grid]} />);

  const deleteButtons = container.querySelectorAll(".btn-icon");
  fireEvent.click(deleteButtons[0]);

  assert.equal(container.querySelectorAll('input[name$="-name"]').length, 1);
  const placeholder = container.textContent || "";
  assert.match(placeholder, /Aucun élément défini/);
});

test("adding a new version clones the active grid's parameters and client types but clears the effective date", () => {
  const grid = emptyGrid({
    effective_date: "2025-01-01",
    parameters: [{ id: "p1", name: "Spectacle" }],
    client_types: [{ id: "ct1", name: "Interne" }]
  });
  const { getByText, container } = render(<Harness initialGrids={[grid]} />);

  fireEvent.click(getByText("+ Nouvelle version"));

  const tabs = container.querySelectorAll(".grid-version-tab");
  assert.equal(tabs.length, 2);
  assert.match(tabs[1].textContent || "", /Par défaut/);

  const paramInputs = container.querySelectorAll('input[name$="-name"]') as NodeListOf<HTMLInputElement>;
  assert.equal(paramInputs[0].value, "Spectacle");
});

test("deleting the only version is blocked with a warning toast", () => {
  const grid = emptyGrid();
  const { getByText } = render(<Harness initialGrids={[grid]} />);

  fireEvent.click(getByText("Supprimer la version"));

  const toast = document.querySelector("#toast-container .toast-message");
  assert.ok(toast);
  assert.match(toast!.textContent!, /au moins une version/);
});

test("deleting a version when more than one exists asks for confirmation and removes it", () => {
  const grids = [emptyGrid({ id: "g1", effective_date: "" }), emptyGrid({ id: "g2", effective_date: "2026-01-01" })];
  const { container, getByText } = render(<Harness initialGrids={grids} />);

  const tabsBefore = container.querySelectorAll(".grid-version-tab");
  assert.equal(tabsBefore.length, 2);

  fireEvent.click(getByText("Supprimer la version"));

  const tabsAfter = container.querySelectorAll(".grid-version-tab");
  assert.equal(tabsAfter.length, 1);
});

test("declining the confirmation keeps both versions", () => {
  (globalThis as any).confirm = () => false;
  const grids = [emptyGrid({ id: "g1" }), emptyGrid({ id: "g2", effective_date: "2026-01-01" })];
  const { container, getByText } = render(<Harness initialGrids={grids} />);

  fireEvent.click(getByText("Supprimer la version"));

  assert.equal(container.querySelectorAll(".grid-version-tab").length, 2);
});

export {};
