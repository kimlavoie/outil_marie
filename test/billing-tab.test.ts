import test from "node:test";
import assert from "node:assert/strict";
import { dom } from "./dom-mock.ts";
import "./indexeddb-mock.ts";

test.after(() => dom.window.close());

// generateBillingLines auto-populates distribution rows from whatever's currently on the
// activity form (room tariffs, staff, services, autres frais) — this exercises the staff/
// services/fees line-generation directly against a hand-built DOM fixture (mirroring the real
// markup produced by src/activities/reservations/subrows.ts) rather than driving the full
// reservation-card UI, since only these three lists (and #form-distribution-list) matter here.
import { appState, getSafetyBackupsFromDb } from "../src/state/state.ts";
import { generateBillingLines } from "../src/activities/billing-tab.ts";

function baseSettings(overrides: any = {}) {
  return {
    theme: "dark",
    rooms: [],
    departments: [],
    accounts: [],
    last_backup_date: "",
    backup_reminder_days: 7,
    salaries: [
      {
        id: "sal1",
        job: "Directeur technique",
        rate_versions: [{ id: "rv1", effective_date: "", rate: 20, overtime_rate: 30 }]
      }
    ],
    services: [
      {
        id: "svc1",
        name: "Projecteur",
        type: "hourly",
        tarifs: [{ id: "svctarif1", gl_account_code: "GL-SERVICE", rate_versions: [{ effective_date: "", rate: 10 }] }]
      }
    ],
    global_tasks: [],
    schedulable_tasks: [],
    ...overrides
  };
}

function setupSkeleton() {
  document.body.innerHTML = `
    <div id="form-activity-reservations">
      <div class="room-staff-list">
        <div class="distribution-row-wrapper">
          <div class="distribution-row">
            <select class="staff-salary-select"><option value="sal1" selected>Directeur technique</option></select>
            <select class="staff-gl-select"><option value="GL-STAFF" selected>GL-STAFF</option></select>
            <input type="checkbox" class="staff-use-custom-rate">
            <input class="staff-count-input" value="2">
            <input class="staff-hours-input" value="4">
            <div class="staff-overtime-container">
              <input type="checkbox" class="staff-overtime-checkbox" checked>
            </div>
          </div>
        </div>
      </div>
      <div class="room-services-list">
        <div class="distribution-row-wrapper">
          <div class="distribution-row">
            <select class="service-select"><option value="svc1" selected>Projecteur</option></select>
            <select class="service-tarif-select"><option value="svctarif1" selected>Tarif régulier</option></select>
            <input class="service-hours-input" value="3">
          </div>
        </div>
      </div>
      <div class="room-fees-list">
        <div class="distribution-row">
          <div class="fee-gl-select-wrapper"><input class="searchable-select-value" value="GL-FEE"></div>
          <input class="fee-amount-input" value="25">
          <input class="fee-desc-input" value="Frais divers">
        </div>
      </div>
    </div>
    <div id="form-distribution-list"></div>
  `;
}

function distributionRows() {
  return Array.from(document.querySelectorAll("#form-distribution-list .distribution-row")).map(row => ({
    account: (row.querySelector(".dist-account-select-wrapper .searchable-select-value") as HTMLInputElement | null)?.value ?? null,
    amount: (row.querySelector(".dist-amount-input") as HTMLInputElement | null)?.value ?? null,
    details: (row.querySelector(".dist-details-input") as HTMLInputElement | null)?.value ?? null
  }));
}

test.beforeEach(() => {
  appState.settings = baseSettings();
  appState.activities = [];
  setupSkeleton();
  (globalThis as any).confirm = () => true;
});

test("generateBillingLines adds a staff line costing (rate x hours + overtime rate x overtime hours) x count", () => {
  generateBillingLines({ distributions: [] });

  const rows = distributionRows();
  // 30 * 4 * 2 = 240
  const staffRow = rows.find(r => r.details && r.details.includes("Directeur technique"));
  assert.ok(staffRow, "expected a staff distribution row");
  assert.equal(staffRow!.amount, "240");
});

test("generateBillingLines adds an hourly service line costing rate x hours", () => {
  generateBillingLines({ distributions: [] });

  const rows = distributionRows();
  // 10 * 3 = 30
  const serviceRow = rows.find(r => r.details && r.details.includes("Projecteur"));
  assert.ok(serviceRow, "expected a service distribution row");
  assert.equal(serviceRow!.amount, "30");
});

test("generateBillingLines carries over an 'autre frais' row as-is (account/amount/description)", () => {
  generateBillingLines({ distributions: [] });

  const rows = distributionRows();
  const feeRow = rows.find(r => r.details === "Frais divers");
  assert.ok(feeRow, "expected the autre-frais distribution row");
  assert.equal(feeRow!.amount, "25");
});

test("generateBillingLines skips a staff/service line entirely when its computed amount is 0", () => {
  (document.querySelector(".staff-hours-input") as HTMLInputElement).value = "0";
  const overtimeCheckbox = document.querySelector(".staff-overtime-checkbox") as HTMLInputElement;
  if (overtimeCheckbox) overtimeCheckbox.checked = false;
  (document.querySelector(".service-hours-input") as HTMLInputElement).value = "0";

  generateBillingLines({ distributions: [] });

  const rows = distributionRows();
  assert.equal(rows.some(r => r.details && r.details.includes("Directeur technique")), false);
  assert.equal(rows.some(r => r.details && r.details.includes("Projecteur")), false);
  // The fee line is unaffected and still generated.
  assert.equal(rows.some(r => r.details === "Frais divers"), true);
});

test("generateBillingLines asks for confirmation before replacing existing distribution lines, and aborts if declined", () => {
  (globalThis as any).confirm = () => false;
  const existing = { id: "act-1", distributions: [{ account_code: "GL-OLD", amount: 10 }] };

  generateBillingLines(existing);

  // Declined: the pre-existing markup (empty #form-distribution-list, since the skeleton never
  // called addDistributionRow) must be left untouched rather than regenerated.
  assert.equal(document.querySelectorAll("#form-distribution-list .distribution-row").length, 0);
});

test("generateBillingLines takes a named safety backup before replacing existing distribution lines", async () => {
  (globalThis as any).confirm = () => true;
  const existing = { id: "act-1", distributions: [{ account_code: "GL-OLD", amount: 10 }] };

  const before = (await getSafetyBackupsFromDb()).length;
  await generateBillingLines(existing);
  const after = await getSafetyBackupsFromDb();

  assert.equal(after.length, before + 1);
  assert.equal(after[0].label, "avant_facturation_auto");
  // The regeneration itself still ran after the snapshot was taken.
  assert.equal(document.querySelectorAll("#form-distribution-list .distribution-row").length > 0, true);
});

test("generateBillingLines does not take a safety backup when there was nothing to replace", async () => {
  const before = (await getSafetyBackupsFromDb()).length;
  await generateBillingLines({ distributions: [] });
  const after = await getSafetyBackupsFromDb();

  assert.equal(after.length, before);
});

test("generateBillingLines generates room tariff distribution row for external client, but not for internal client", () => {
  // 1. Test external client
  document.body.innerHTML = `
    <input id="form-activity-client-type" value="externe">
    <div id="form-activity-reservations">
      <div class="reservation-card" id="res-1">
        <input class="searchable-select-value" value="Salle Test">
        <input class="room-tariff-parameter" value="__custom__">
        <input class="room-tariff-client-type" value="">
        <input class="room-tariff-custom-desc" value="Location Salle">
        <input class="room-tariff-custom-amount" value="150">
        <input class="room-tariff-custom-gl" value="GL-ROOM">
        <div class="reservation-slots-list">
          <div class="reservation-slot-row">
            <input class="slot-date-input" value="2025-08-01">
            <input class="slot-start-time-input" value="">
            <input class="slot-end-time-input" value="">
          </div>
        </div>
        <div class="reservation-install-toggle"></div>
        <div class="reservation-dismantle-toggle"></div>
        <div class="room-bar-toggle-group"><button class="pill-toggle"></button></div>
        <div class="room-bar-drink-group"></div>
        <div class="room-bar-service-type-group"></div>
        <input class="room-bar-hostess-count" value="0">
        <input class="room-bar-special-order" value="">
        <input class="room-host-duties-count" value="0">
        <div class="room-staff-list"></div>
        <div class="room-services-list"></div>
        <div class="room-fees-list"></div>
      </div>
    </div>
    <div id="form-distribution-list"></div>
  `;

  appState.settings.rooms = [{ name: "Salle Test", rate_type: "daily" } as any];
  appState.settings.accounts = [{ code: "GL-ROOM", description: "Location" }];

  generateBillingLines({ distributions: [] });

  let rows = distributionRows();
  let roomRow = rows.find(r => r.account === "GL-ROOM");
  assert.ok(roomRow, "expected a room distribution row for external client");
  assert.equal(roomRow!.amount, "150");

  // 2. Test internal client
  (document.getElementById("form-activity-client-type") as HTMLInputElement).value = "interne";
  document.getElementById("form-distribution-list")!.innerHTML = "";

  generateBillingLines({ distributions: [] });

  rows = distributionRows();
  roomRow = rows.find(r => r.account === "GL-ROOM");
  assert.equal(roomRow, undefined, "expected no room distribution row for internal client");
});
