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
import { addReservationCard } from "../src/activities/reservations/index.ts";
import { computeFormRevenueSubtotal, updateSubmissionFinancialSummary, updateDistributionTotal } from "../src/activities/financials.ts";
import { addDistributionRow } from "../src/activities/distribution-rows.ts";

const SALARY_DT = {
  id: "salary-dt",
  job: "Directeur technique",
  rate_versions: [{ id: "rv-dt", effective_date: "", rate: 50, overtime_rate: 75 }]
};

const SERVICE_HOURLY = {
  id: "service-hourly",
  name: "Projecteur",
  type: "hourly",
  tarifs: [{ id: "tarif-hourly", label: "", gl_account_code: "", rate_versions: [{ id: "rv-hourly", effective_date: "", rate: 20 }] }]
};

const ROOM_TEST = {
  name: "Salle Test",
  color: "#000000",
  pricing_grids: [
    {
      id: "grid-1",
      effective_date: "",
      parameters: [{ id: "param-1", name: "Tarif" }],
      client_types: [{ id: "ct-1", name: "Externe", gl_account_code: "GL-ROOM" }],
      cells: [{ parameter_id: "param-1", client_type_id: "ct-1", amount: 100 }]
    }
  ],
  linked_rooms: [] as string[],
  linked_staff: [] as any[],
  linked_fees: [] as any[],
  linked_tasks: [] as any[]
};

function baseState(overrides: any = {}) {
  return {
    settings: {
      theme: "dark",
      rooms: [ROOM_TEST],
      departments: [],
      accounts: [
        { code: "GL-ROOM", description: "Location de salle" },
        { code: "GL-1", description: "Compte 1" }
      ],
      last_backup_date: "",
      backup_reminder_days: 7,
      salaries: [SALARY_DT],
      services: [SERVICE_HOURLY],
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

function setupForm() {
  document.body.innerHTML = `
    <div id="form-activity-reservations"></div>
    <div id="submission-financial-summary"></div>
    <div id="form-distribution-total-val"></div>
    <div id="form-distribution-total-warning"></div>
    <div id="form-distribution-list"></div>
    <input id="form-activity-internal-id" value="">
  `;
}

test.beforeEach(() => {
  setAppState(baseState());
  setupForm();
});

test("computeFormRevenueSubtotal sums room tariff, staff, services and fees straight from the live form", () => {
  addReservationCard({
    id: "res-1",
    room_name: "Salle Test",
    tariff_id: "param-1::ct-1",
    tariff_amount: 100,
    slots: [{ id: "slot-1", date: "2025-08-01", start_time: "09:00", end_time: "17:00" }],
    staff: [{ id: "staff-1", salary_id: "salary-dt", count: 1, hours: 5, overtime_hours: 0, gl_account_code: "GL-DT", tarif_id: "" }],
    services: [{ id: "svc-1", service_id: "service-hourly", count: 1, hours: 2, tarif_id: "tarif-hourly" }],
    fees: [{ id: "fee-1", description: "Montage", amount: 50, gl_account_code: "" }]
  });

  const totals = computeFormRevenueSubtotal();
  assert.equal(totals.roomsTotal, 100); // 100/day x 1 slot
  assert.equal(totals.staffTotal, 250); // 50 x 5 hours x 1 count
  assert.equal(totals.servicesTotal, 40); // 20 x 2 hours x 1 count
  assert.equal(totals.feesTotal, 50);
  assert.equal(totals.subtotal, 440);
});

test("computeFormRevenueSubtotal multiplies the room tariff by the number of slots (days)", () => {
  addReservationCard({
    id: "res-1",
    room_name: "Salle Test",
    tariff_id: "param-1::ct-1",
    tariff_amount: 100,
    slots: [
      { id: "slot-1", date: "2025-08-01", start_time: "", end_time: "" },
      { id: "slot-2", date: "2025-08-02", start_time: "", end_time: "" }
    ],
    staff: [],
    services: [],
    fees: []
  });

  const totals = computeFormRevenueSubtotal();
  assert.equal(totals.roomsTotal, 200);
});

test("updateSubmissionFinancialSummary renders the subtotal, TPS (5%) and TVQ (9.975%) into the summary container", () => {
  addReservationCard({
    id: "res-1",
    room_name: "Salle Test",
    tariff_id: "param-1::ct-1",
    tariff_amount: 100,
    slots: [{ id: "slot-1", date: "2025-08-01", start_time: "", end_time: "" }],
    staff: [],
    services: [],
    fees: []
  });

  updateSubmissionFinancialSummary();
  const html = document.getElementById("submission-financial-summary")!.innerHTML;
  assert.match(html, /100,00/); // subtotal = roomsTotal only = 100
  assert.match(html, /5,00/); // TPS: 100 x 5% = 5
  assert.match(html, /9,98|9,975/); // TVQ: 100 x 9.975% = 9.975, rounded for display
});

test("updateDistributionTotal shows no discrepancy warning when entered distributions match the computed subtotal", () => {
  addReservationCard({
    id: "res-1",
    room_name: "Salle Test",
    tariff_id: "param-1::ct-1",
    tariff_amount: 100,
    slots: [{ id: "slot-1", date: "2025-08-01", start_time: "", end_time: "" }],
    staff: [],
    services: [],
    fees: []
  });

  addDistributionRow("GL-ROOM", 100, "RI-001", "");

  const totalEl = document.getElementById("form-distribution-total-val")!;
  assert.match(totalEl.textContent!, /100,00/);
  const warningEl = document.getElementById("form-distribution-total-warning")!;
  assert.equal(warningEl.style.display, "none");
});

test("updateDistributionTotal warns with the signed gap when entered distributions don't match the computed subtotal", () => {
  addReservationCard({
    id: "res-1",
    room_name: "Salle Test",
    tariff_id: "param-1::ct-1",
    tariff_amount: 100,
    slots: [{ id: "slot-1", date: "2025-08-01", start_time: "", end_time: "" }],
    staff: [],
    services: [],
    fees: []
  });

  addDistributionRow("GL-ROOM", 60, "RI-001", ""); // 40 short of the 100 subtotal

  const warningEl = document.getElementById("form-distribution-total-warning")!;
  assert.equal(warningEl.style.display, "inline");
  assert.match(warningEl.textContent!, /40,00/);
  assert.match(warningEl.textContent!, /en dessous/);
});

test("addDistributionRow sums multiple rows into the distribution total", () => {
  addDistributionRow("GL-ROOM", 30, "RI-001", "");
  addDistributionRow("GL-1", 20, "RI-002", "");

  const totalEl = document.getElementById("form-distribution-total-val")!;
  assert.match(totalEl.textContent!, /50,00/);
  assert.equal(document.querySelectorAll("#form-distribution-list .distribution-row").length, 2);
});

export {};
