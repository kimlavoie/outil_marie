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

import { act } from "react";
import { render, cleanup } from "@testing-library/react";
import { setAppState } from "../src/state/state.ts";
import { NewActivityModal } from "../src/components/modals/NewActivityModal.tsx";
import { openNewActivityModal, closeNewActivityModal } from "../src/activities/new-activity-modal.ts";

// Regression test: form.ts's global Escape-key handler calls closeNewActivityModal() directly
// (not through the React component's own onClick handlers). openNewActivityModal() already
// delegated to the mounted <NewActivityModal> via triggerOpenNewActivityModal(), but
// closeNewActivityModal() didn't have the equivalent triggerCloseNewActivityModal() delegation —
// so once the modal was opened through the real, live <NewActivityModal> (always mounted via
// GlobalModals.tsx), pressing Escape silently did nothing: the legacy fallback body in
// new-activity-modal.ts only touches ids (#new-activity-modal, #modal-backdrop) that don't exist
// in the live DOM.

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
  document.body.innerHTML = "";
});

test.afterEach(() => cleanup());

test("closeNewActivityModal() (the global Escape-key path) closes the real, mounted modal", () => {
  render(<NewActivityModal />);

  act(() => openNewActivityModal("soumission"));
  assert.ok(document.querySelector(".modal.active"), "modal should be open after openNewActivityModal()");

  act(() => closeNewActivityModal());
  assert.equal(document.querySelector(".modal.active"), null, "modal should be closed after closeNewActivityModal()");
});

export {};
