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

import { setAppState } from "../src/state/state.ts";
import { saveUiState, restoreUiState } from "../src/state/ui-state.ts";
import { reconciliationState } from "../src/services/reconciliation.ts";

const UI_STATE_KEY = "outil_marie_ui_state";

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
  document.body.innerHTML = "";
  (globalThis as any).localStorage.clear();
  reconciliationState.filter = "all";
  reconciliationState.page = 1;
  reconciliationState.pageSize = 10;
});

// Neither the "activities" nor the "accountReport" slice of outil_marie_ui_state is saved/restored
// here anymore — ActivitiesView.tsx and AccountReportView.tsx each save/restore their own slice
// directly (their own localStorage effect + getSavedUiState() read). This module used to also
// generate/restore both from dead legacy globals (activitiesState.sortKey/accountReportState.
// sortKey and friends, none of which either live view reads or writes anymore) — for "activities"
// that was an active bug (silently clobbering the correct persisted values back to defaults on
// every saveUiState() call, of which there are ~15 call sites: drawer close, autosave, undo, bulk
// actions, etc.); for "accountReport" it was simply inert, since nothing ever read that slice back.
// Either way there's deliberately no coverage for either slice left here — see ui-state.ts's header
// comment.

test("saveUiState persists reconciliation sort/pagination state under one localStorage key", () => {
  reconciliationState.filter = "unmatched";
  reconciliationState.page = 2;

  saveUiState();

  const saved = JSON.parse((globalThis as any).localStorage.getItem(UI_STATE_KEY)!);
  assert.equal(saved.reconciliation.filter, "unmatched");
  assert.equal(saved.reconciliation.page, 2);
  assert.equal(saved.activities, undefined);
  assert.equal(saved.accountReport, undefined);
});

test("restoreUiState is a no-op when nothing was ever saved", () => {
  restoreUiState();
  assert.equal(reconciliationState.page, 1);
});

test("restoreUiState round-trips everything saveUiState wrote", () => {
  reconciliationState.filter = "unmatched";
  reconciliationState.page = 2;
  reconciliationState.pageSize = 50;
  saveUiState();

  // Reset everything back to defaults before restoring, to prove restoreUiState is what put it back.
  reconciliationState.filter = "all";
  reconciliationState.page = 1;
  reconciliationState.pageSize = 10;

  restoreUiState();

  assert.equal(reconciliationState.filter, "unmatched");
  assert.equal(reconciliationState.page, 2);
  assert.equal(reconciliationState.pageSize, 50);
});

test("restoreUiState toggles the matching .reconcile-tab's active class to reflect the restored filter", () => {
  document.body.innerHTML = `
    <button class="reconcile-tab" data-recon-filter="all">Tout</button>
    <button class="reconcile-tab" data-recon-filter="unmatched">Non concilié</button>
  `;
  (globalThis as any).localStorage.setItem(UI_STATE_KEY, JSON.stringify({ reconciliation: { filter: "unmatched" } }));

  restoreUiState();

  const tabs = Array.from(document.querySelectorAll(".reconcile-tab"));
  assert.equal(tabs.find(t => t.getAttribute("data-recon-filter") === "unmatched")!.classList.contains("active"), true);
  assert.equal(tabs.find(t => t.getAttribute("data-recon-filter") === "all")!.classList.contains("active"), false);
});

test("restoreUiState ignores malformed JSON instead of throwing", () => {
  (globalThis as any).localStorage.setItem(UI_STATE_KEY, "{not json");
  assert.doesNotThrow(() => restoreUiState());
});

export {};
