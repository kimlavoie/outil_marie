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
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).confirm = () => true;

import { act } from "react";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { setAppState, appState } from "../src/state/state.ts";
import { ExcelExportModal, openExcelExportModal } from "../src/components/modals/ExcelExportModal.tsx";
import { loadPresets } from "../src/services/excel-export-modal.ts";

// ExcelExportModal.tsx is the React reimplementation of services/excel-export-modal.ts's
// renderModalBody()/bindModalEvents() (that module now only keeps preset CRUD, covered by
// test/excel-export-modal.test.ts). Opened the same way as before: openExcelExportModal() reaches
// a module-level subscriber, same pattern as TaxOverrideModal.tsx.

function baseState(overrides: any = {}) {
  return {
    settings: {
      theme: "dark",
      rooms: [{ name: "Salle A", color: "#000", pricing_grids: [], linked_rooms: [], linked_staff: [], linked_fees: [], linked_tasks: [] }],
      departments: ["Musique"],
      accounts: [{ code: "892-0000", description: "SCOLAIRE" }],
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

function activity(overrides: any = {}) {
  return {
    id: "act-1",
    name: "Activité test",
    date_start: "2025-08-15",
    client_type: "externe",
    state: "brouillon",
    distributions: [],
    reservations: [],
    deleted: false,
    ...overrides
  };
}

test.beforeEach(() => {
  setAppState(baseState());
  localStorage.clear();
  document.body.innerHTML = "";
  render(<ExcelExportModal />);
});

test.afterEach(() => cleanup());

test("is closed until openExcelExportModal() is called", () => {
  assert.equal(document.querySelector(".excel-export-modal"), null);

  act(() => openExcelExportModal());

  assert.ok(document.querySelector(".excel-export-modal.active"));
});

test("defaults to the Rapport Standard mode, hiding the custom filters/columns section", () => {
  act(() => openExcelExportModal());

  const standardRadio = document.querySelector<HTMLInputElement>("input[name='excel_mode'][value='standard']")!;
  assert.equal(standardRadio.checked, true);
  assert.equal(document.getElementById("excel-export-custom-section"), null);
});

test("switching to Rapport Personnalisé reveals filters/columns and the live counter reacts to them", () => {
  setAppState(
    baseState({
      activities: [
        activity({ id: "act-interne", client_type: "interne" }),
        activity({ id: "act-externe", client_type: "externe" })
      ]
    })
  );
  act(() => openExcelExportModal());

  const customRadio = document.querySelector<HTMLInputElement>("input[name='excel_mode'][value='custom']")!;
  act(() => fireEvent.click(customRadio));
  assert.ok(document.getElementById("excel-export-custom-section"));

  const counter = document.querySelector(".excel-live-counter")!;
  assert.match(counter.textContent!, /2.*sur.*2/s);

  const internalChk = Array.from(document.querySelectorAll<HTMLInputElement>(".excel-grid-2 input[type=checkbox]")).find(
    c => c.closest("label")?.textContent?.includes("Client Interne")
  )!;
  act(() => fireEvent.click(internalChk));

  assert.match(document.querySelector(".excel-live-counter")!.textContent!, /1.*sur.*2/s);
});

test("saving a preset persists it and it appears in the preset dropdown", () => {
  act(() => openExcelExportModal());
  act(() => fireEvent.click(document.querySelector<HTMLInputElement>("input[name='excel_mode'][value='custom']")!));

  const saveToggleBtn = document.querySelector<HTMLButtonElement>('[title="Sauvegarder la configuration actuelle comme préréglage"]')!;
  act(() => fireEvent.click(saveToggleBtn));

  const nameInput = document.querySelector<HTMLInputElement>('input[placeholder^="Nom du préréglage"]')!;
  act(() => fireEvent.change(nameInput, { target: { value: "Mon préréglage" } }));
  act(() => fireEvent.click(document.querySelector<HTMLButtonElement>(".excel-sub-box .btn-primary")!));

  assert.equal(loadPresets().length, 1);
  assert.equal(loadPresets()[0].name, "Mon préréglage");

  const select = document.getElementById("excel-preset-select") as HTMLSelectElement;
  assert.ok(Array.from(select.options).some(o => o.textContent === "Mon préréglage"));
});

test("Réinitialiser restores the default options", () => {
  act(() => openExcelExportModal());
  act(() => fireEvent.click(document.querySelector<HTMLInputElement>("input[name='excel_mode'][value='custom']")!));

  const searchInput = document.getElementById("excel-filter-search") as HTMLInputElement;
  act(() => fireEvent.change(searchInput, { target: { value: "conférence" } }));
  assert.equal(searchInput.value, "conférence");

  act(() => fireEvent.click(document.querySelector<HTMLButtonElement>('[title="Réinitialiser la configuration"]')!));

  // Reset returns to the default options, whose mode is "standard" — the custom section
  // (and the search field within it) is gone rather than merely cleared.
  assert.equal(document.querySelector<HTMLInputElement>("input[name='excel_mode'][value='standard']")!.checked, true);
  assert.equal(document.getElementById("excel-filter-search"), null);
});

test("the close button and backdrop click both hide the modal", () => {
  act(() => openExcelExportModal());
  assert.ok(document.querySelector(".excel-export-modal.active"));

  act(() => fireEvent.click(document.querySelector<HTMLButtonElement>('[title="Fermer (Échap)"]')!));
  assert.equal(document.querySelector(".excel-export-modal"), null);

  act(() => openExcelExportModal());
  act(() => fireEvent.click(document.querySelector(".modal-backdrop")!));
  assert.equal(document.querySelector(".excel-export-modal"), null);
});

export {};
