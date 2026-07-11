import test from "node:test";
import assert from "node:assert/strict";
import { dom } from "./dom-mock.ts";

test.after(() => dom.window.close());

(globalThis as any).localStorage = {
  store: {} as Record<string, string>,
  getItem(key: string) { return this.store[key] || null; },
  setItem(key: string, value: string) { this.store[key] = String(value); },
  removeItem(key: string) { delete this.store[key]; },
  clear() { this.store = {}; }
};

import { setAppState } from "../src/state/state.ts";
import { validateDateFieldFiscalYear, clearDateFieldErrors } from "../src/activities/datepicker.ts";

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

// Builds a date input plus its associated "<id>-fy-error" element, the convention
// validateDateFieldFiscalYear relies on to find where to display its message.
function makeDateField(id: string, value: string) {
  document.body.innerHTML = `
    <input type="text" id="${id}" class="form-input" value="${value}">
    <div class="field-error-msg" id="${id}-fy-error"></div>
  `;
  return document.getElementById(id) as HTMLInputElement;
}

test.beforeEach(() => {
  setAppState(baseState());
});

test("validateDateFieldFiscalYear accepts a date within the active fiscal year", () => {
  const input = makeDateField("slot-date", "2025-08-15"); // within 2025-2026 (Jul 2025 - Jun 2026)
  const valid = validateDateFieldFiscalYear(input);

  assert.equal(valid, true);
  const errorEl = document.getElementById("slot-date-fy-error")!;
  assert.equal(errorEl.textContent, "");
  assert.equal(errorEl.classList.contains("visible"), false);
  assert.equal(input.classList.contains("invalid"), false);
});

test("validateDateFieldFiscalYear rejects a date outside the active fiscal year and shows the error", () => {
  const input = makeDateField("slot-date", "2024-12-31"); // before fiscal year 2025-2026 starts
  const valid = validateDateFieldFiscalYear(input);

  assert.equal(valid, false);
  const errorEl = document.getElementById("slot-date-fy-error")!;
  assert.match(errorEl.textContent!, /année financière active/);
  assert.equal(errorEl.classList.contains("visible"), true);
  assert.equal(input.classList.contains("invalid"), true);
});

test("validateDateFieldFiscalYear ignores an empty value", () => {
  const input = makeDateField("slot-date", "");
  const valid = validateDateFieldFiscalYear(input);
  assert.equal(valid, true);
  assert.equal(input.classList.contains("invalid"), false);
});

test("validateDateFieldFiscalYear ignores a malformed (non YYYY-MM-DD) value instead of flagging it", () => {
  const input = makeDateField("slot-date", "15/08/2025");
  const valid = validateDateFieldFiscalYear(input);
  assert.equal(valid, true);
  assert.equal(input.classList.contains("invalid"), false);
});

test("validateDateFieldFiscalYear is a no-op (returns true) when there is no matching error element", () => {
  document.body.innerHTML = `<input type="text" id="orphan-date" value="2024-01-01">`;
  const input = document.getElementById("orphan-date") as HTMLInputElement;
  assert.equal(validateDateFieldFiscalYear(input), true);
});

test("validateDateFieldFiscalYear clears a previously-shown error once the value becomes valid again", () => {
  const input = makeDateField("slot-date", "2024-12-31");
  validateDateFieldFiscalYear(input);
  assert.equal(input.classList.contains("invalid"), true);

  input.value = "2025-09-01";
  validateDateFieldFiscalYear(input);
  assert.equal(input.classList.contains("invalid"), false);
  assert.equal(document.getElementById("slot-date-fy-error")!.textContent, "");
});

test("clearDateFieldErrors clears every error/invalid marker under #activity-form but leaves fields outside it alone", () => {
  document.body.innerHTML = `
    <div id="activity-form">
      <input type="text" id="in-form-date" class="form-input invalid" value="2024-12-31">
      <div class="field-error-msg visible" id="in-form-date-fy-error">Erreur</div>
    </div>
    <input type="text" id="outside-date" class="form-input invalid" value="2024-12-31">
    <div class="field-error-msg visible" id="outside-date-fy-error">Erreur</div>
  `;

  clearDateFieldErrors();

  assert.equal(document.getElementById("in-form-date")!.classList.contains("invalid"), false);
  const inFormError = document.getElementById("in-form-date-fy-error")!;
  assert.equal(inFormError.textContent, "");
  assert.equal(inFormError.classList.contains("visible"), false);

  // Outside #activity-form: untouched
  assert.equal(document.getElementById("outside-date")!.classList.contains("invalid"), true);
  assert.equal(document.getElementById("outside-date-fy-error")!.textContent, "Erreur");
});

export {};
