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

import { setAppState, appState } from "../src/state/state.ts";
import {
  openTaxOverrideModal,
  closeTaxOverrideModal,
  initTaxOverrideModal
} from "../src/activities/tax-override.ts";

function setupDom() {
  document.body.innerHTML = `
    <div id="tax-override-modal"></div>
    <div id="modal-backdrop"></div>
    <select id="tax-override-tps-mode">
      <option value="default">Default</option>
      <option value="rate">Rate</option>
      <option value="amount">Amount</option>
    </select>
    <input id="tax-override-tps-value" value="" />
    <textarea id="tax-override-tps-note"></textarea>
    
    <select id="tax-override-tvq-mode">
      <option value="default">Default</option>
      <option value="rate">Rate</option>
      <option value="amount">Amount</option>
    </select>
    <input id="tax-override-tvq-value" value="" />
    <textarea id="tax-override-tvq-note"></textarea>

    <div id="tax-override-non-taxable-warning"></div>
    <button id="tax-override-modal-close"></button>
    <button id="tax-override-modal-cancel"></button>
    <button id="tax-override-modal-save"></button>
    
    <div id="submission-financial-summary"></div>
    <div id="form-distribution-total-val"></div>
    <div id="form-distribution-total-warning"></div>
    <div id="form-distribution-list"></div>
    <input id="form-activity-internal-id" value="">
    <div id="form-activity-reservations"></div>
  `;
}

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
    activities: [
      { id: "act-1", name: "Activité 1", tax_overrides: { tps: { mode: "rate", value: 0, note: "Exonéré" } } },
      { id: "act-2", name: "Activité 2" }
    ],
    favorites: [],
    selected_year: "2025-2026",
    selected_quarters: [1, 2, 3, 4],
    ...overrides
  };
}

test.beforeEach(() => {
  setAppState(baseState());
  setupDom();
});

test("openTaxOverrideModal fills form elements and updates styles", () => {
  openTaxOverrideModal("act-1");
  
  const tpsMode = document.getElementById("tax-override-tps-mode") as HTMLSelectElement;
  const tpsVal = document.getElementById("tax-override-tps-value") as HTMLInputElement;
  const tpsNote = document.getElementById("tax-override-tps-note") as HTMLTextAreaElement;
  
  assert.equal(tpsMode.value, "rate");
  assert.equal(tpsVal.value, "0");
  assert.equal(tpsNote.value, "Exonéré");
  
  const modal = document.getElementById("tax-override-modal")!;
  assert.ok(modal.classList.contains("active"));
});

test("closeTaxOverrideModal removes active classes", () => {
  openTaxOverrideModal("act-1");
  closeTaxOverrideModal();
  
  const modal = document.getElementById("tax-override-modal")!;
  assert.ok(!modal.classList.contains("active"));
});

test("initTaxOverrideModal binds events and reacts to change", () => {
  initTaxOverrideModal();
  
  const tpsMode = document.getElementById("tax-override-tps-mode") as HTMLSelectElement;
  const tpsVal = document.getElementById("tax-override-tps-value") as HTMLInputElement;
  
  tpsMode.value = "default";
  tpsMode.dispatchEvent(new Event("change"));
  assert.ok(tpsVal.disabled);
  
  tpsMode.value = "rate";
  tpsMode.dispatchEvent(new Event("change"));
  assert.ok(!tpsVal.disabled);
});

test("saving tax overrides updates activity in appState", () => {
  initTaxOverrideModal();
  openTaxOverrideModal("act-2");
  
  const tpsMode = document.getElementById("tax-override-tps-mode") as HTMLSelectElement;
  const tpsVal = document.getElementById("tax-override-tps-value") as HTMLInputElement;
  const tpsNote = document.getElementById("tax-override-tps-note") as HTMLTextAreaElement;
  
  tpsMode.value = "amount";
  tpsVal.value = "10";
  tpsNote.value = "Forfait";
  
  const saveBtn = document.getElementById("tax-override-modal-save")!;
  saveBtn.click();
  
  const updatedAct = appState.activities.find(a => a.id === "act-2")!;
  assert.ok(updatedAct.tax_overrides);
  assert.equal(updatedAct.tax_overrides.tps.mode, "amount");
  assert.equal(updatedAct.tax_overrides.tps.value, 10);
  assert.equal(updatedAct.tax_overrides.tps.note, "Forfait");
});
