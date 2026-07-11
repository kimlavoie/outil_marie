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

import { render, cleanup, fireEvent } from "@testing-library/react";
import { setAppState } from "../src/state/state.ts";
import { RateVersionsEditor } from "../src/components/settings/common.tsx";
import { newRateVersionRow } from "../src/utils/utils.ts";

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

test("RateVersionsEditor renders one row per entry with its effective date and rate", () => {
  const rows = [
    { ...newRateVersionRow(), effective_date: "2025-01-01", rate: "100" },
    { ...newRateVersionRow(), effective_date: "2026-01-01", rate: "150" }
  ];

  const { container } = render(<RateVersionsEditor rows={rows} onChange={() => {}} withOvertime={false} />);

  const dateInputs = container.querySelectorAll<HTMLInputElement>("input[type=text]");
  assert.equal(dateInputs.length, 2);
  assert.equal(dateInputs[0].value, "2025-01-01");
  assert.equal(dateInputs[1].value, "2026-01-01");

  const rateInputs = container.querySelectorAll<HTMLInputElement>("input[type=number]");
  assert.equal(rateInputs[0].value, "100");
  assert.equal(rateInputs[1].value, "150");
});

test("RateVersionsEditor hides the overtime rate column when withOvertime is false", () => {
  const rows = [newRateVersionRow()];
  const { container } = render(<RateVersionsEditor rows={rows} onChange={() => {}} withOvertime={false} />);
  assert.equal(container.querySelectorAll<HTMLInputElement>("input[type=number]").length, 1);
});

test("RateVersionsEditor shows the overtime rate column when withOvertime is true", () => {
  const rows = [newRateVersionRow()];
  const { container } = render(<RateVersionsEditor rows={rows} onChange={() => {}} withOvertime={true} />);
  assert.equal(container.querySelectorAll<HTMLInputElement>("input[type=number]").length, 2);
});

test("editing the rate field calls onChange with that row's rate updated, leaving the others untouched", () => {
  const rows = [
    { ...newRateVersionRow(), rate: "100" },
    { ...newRateVersionRow(), rate: "200" }
  ];
  let latest: any = null;
  const { container } = render(<RateVersionsEditor rows={rows} onChange={next => (latest = next)} withOvertime={false} />);

  const rateInputs = container.querySelectorAll<HTMLInputElement>("input[type=number]");
  fireEvent.change(rateInputs[1], { target: { value: "250" } });

  assert.ok(latest);
  assert.equal(latest[0].rate, "100");
  assert.equal(latest[1].rate, "250");
});

test("clicking a row's delete button calls onChange with that row removed", () => {
  const rows = [
    { ...newRateVersionRow(), rate: "100" },
    { ...newRateVersionRow(), rate: "200" }
  ];
  let latest: any = null;
  const { container } = render(<RateVersionsEditor rows={rows} onChange={next => (latest = next)} withOvertime={false} />);

  const deleteButtons = container.querySelectorAll("button");
  fireEvent.click(deleteButtons[0]);

  assert.equal(latest.length, 1);
  assert.equal(latest[0].rate, "200");
});

export {};
