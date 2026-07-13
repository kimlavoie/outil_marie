import test from "node:test";
import assert from "node:assert/strict";
import { dom } from "../dom-mock.ts";

test.after(() => dom.window.close());

(globalThis as any).localStorage = {
  store: {} as Record<string, string>,
  getItem(key: string) { return this.store[key] || null; },
  setItem(key: string, value: string) { this.store[key] = String(value); },
  removeItem(key: string) { delete this.store[key]; },
  clear() { this.store = {}; }
};

import { setAppState } from "../../src/state/state.ts";
import {
  addStaffRow,
  addServiceRow,
  addFeeRow,
  updateStaffRowSubtotal,
  updateServiceRowSubtotal,
  collectStaffFromForm,
  collectServicesFromForm,
  collectFeesFromForm,
  resetIncompleteRowWarnings,
  getIncompleteRowWarnings,
  autoAddTechnicalDirectorIfNeeded,
  TECHNICAL_DIRECTOR_SALARY_ID,
  autoAddProjectorIfNeeded,
  autoRemoveProjectorIfNeeded,
  PROJECTOR_SERVICE_ID
} from "../../src/activities/reservations/subrows.ts";

const SALARY_DT = {
  id: "salary-dt",
  job: "Directeur technique",
  rate_versions: [{ id: "rv-dt", effective_date: "", rate: 50, overtime_rate: 75 }]
};

const SERVICE_HOURLY = {
  id: "service-location-projecteur",
  name: "Location de projecteur",
  type: "hourly",
  tarifs: [{ id: "tarif-location-projecteur", label: "", gl_account_code: "GL-SVC", rate_versions: [{ id: "rv-location-projecteur", effective_date: "", rate: 20 }] }]
};

const SERVICE_FIXED = {
  id: "service-fixed",
  name: "Piano",
  type: "fixed",
  tarifs: [{ id: "tarif-fixed", label: "", gl_account_code: "GL-SVC2", rate_versions: [{ id: "rv-fixed", effective_date: "", rate: 350 }] }]
};

function baseState(overrides: any = {}) {
  return {
    settings: {
      theme: "dark",
      rooms: [],
      departments: [],
      accounts: [{ code: "GL-DT", description: "Directeur technique" }],
      last_backup_date: "",
      backup_reminder_days: 7,
      salaries: [SALARY_DT],
      services: [SERVICE_HOURLY, SERVICE_FIXED],
      global_tasks: [],
      schedulable_tasks: []
    },
    activities: [],
    favorites: [],
    selected_year: "",
    selected_quarters: [1, 2, 3, 4],
    ...overrides
  };
}

function freshContainer() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

test.beforeEach(() => {
  setAppState(baseState());
  document.body.innerHTML = "";
  resetIncompleteRowWarnings();
});

test("addStaffRow computes the subtotal from the salary's active rate (rate x hours + overtime rate x overtime hours) x count", () => {
  const container = freshContainer();
  addStaffRow(container, "salary-dt", 2, 5, 2, "GL-DT");

  const row = container.querySelector(".distribution-row") as HTMLElement;
  const subtotal = row.querySelector(".staff-subtotal-display")!.textContent;
  // (50 * 5 + 75 * 2) * 2 = (250 + 150) * 2 = 800
  assert.match(subtotal!, /800,00/);
});

test("addStaffRow shows the custom rate fields only when useCustomRate is true, and updateStaffRowSubtotal reads them", () => {
  const container = freshContainer();
  addStaffRow(container, "salary-dt", 1, 4, 0, "GL-DT", false, 100, 0, true);

  const wrapper = container.querySelector(".distribution-row-wrapper") as HTMLElement;
  const customFields = wrapper.querySelector(".staff-custom-fields") as HTMLElement;
  assert.equal(customFields.style.display, "grid");

  const row = wrapper.querySelector(".distribution-row") as HTMLElement;
  updateStaffRowSubtotal(row);
  const subtotal = row.querySelector(".staff-subtotal-display")!.textContent;
  // custom rate 100 x 4 hours x 1 count = 400
  assert.match(subtotal!, /400,00/);
});

test("addStaffRow hides the custom rate fields for a normal (non-custom) rate", () => {
  const container = freshContainer();
  addStaffRow(container, "salary-dt", 1, 1, 0, "GL-DT", false, 0, 0, false);
  const wrapper = container.querySelector(".distribution-row-wrapper") as HTMLElement;
  const customFields = wrapper.querySelector(".staff-custom-fields") as HTMLElement;
  assert.equal(customFields.style.display, "none");
});

test("addServiceRow rates an hourly service by hours x count and shows the hours input", () => {
  const container = freshContainer();
  addServiceRow(container, "service-location-projecteur", 3, 2, "tarif-location-projecteur");

  const row = container.querySelector(".distribution-row") as HTMLElement;
  const subtotal = row.querySelector(".service-subtotal-display")!.textContent;
  // 20 x 2 hours x 3 count = 120
  assert.match(subtotal!, /120,00/);
  const hoursInput = row.querySelector(".service-hours-input") as HTMLElement;
  assert.equal(hoursInput.style.visibility, "visible");
});

test("addServiceRow rates a fixed service by count only and hides the hours input", () => {
  const container = freshContainer();
  addServiceRow(container, "service-fixed", 2, 999, "tarif-fixed");

  const row = container.querySelector(".distribution-row") as HTMLElement;
  const subtotal = row.querySelector(".service-subtotal-display")!.textContent;
  // 350 x 2 count, hours ignored
  assert.match(subtotal!, /700,00/);
  const hoursInput = row.querySelector(".service-hours-input") as HTMLElement;
  assert.equal(hoursInput.style.visibility, "hidden");
});

test("collectStaffFromForm reads back count/hours/overtime/gl_account_code for every staff row on the card", () => {
  const card = freshContainer();
  card.innerHTML = `<div class="room-staff-list"></div>`;
  const staffList = card.querySelector(".room-staff-list") as HTMLElement;
  addStaffRow(staffList, "salary-dt", 2, 5, 1, "GL-DT");

  const staff = collectStaffFromForm(card);
  assert.equal(staff.length, 1);
  assert.equal(staff[0].salary_id, "salary-dt");
  assert.equal(staff[0].count, 2);
  assert.equal(staff[0].hours, 5);
  assert.equal(staff[0].overtime_hours, 1);
  assert.equal(staff[0].gl_account_code, "GL-DT");
  assert.equal(staff[0].tarif_id, "");
});

test("collectStaffFromForm drops rows with no salary selected but warns instead of silently discarding entered data", () => {
  const card = freshContainer();
  card.innerHTML = `<div class="room-staff-list"></div>`;
  const staffList = card.querySelector(".room-staff-list") as HTMLElement;
  // No salary selected, but hours were entered - should be dropped with a warning
  addStaffRow(staffList, "", 1, 3, 0, "");

  const staff = collectStaffFromForm(card);
  assert.equal(staff.length, 0);
  assert.equal(getIncompleteRowWarnings().length, 1);
});

test("collectStaffFromForm silently drops a fully-empty row (no salary, no data entered)", () => {
  const card = freshContainer();
  card.innerHTML = `<div class="room-staff-list"></div>`;
  const staffList = card.querySelector(".room-staff-list") as HTMLElement;
  addStaffRow(staffList, "", 0, 0, 0, "");
  // addStaffRow defaults count to 1 when falsy, so force it back to 0 to simulate a truly blank row
  (staffList.querySelector(".staff-count-input") as HTMLInputElement).value = "0";

  const staff = collectStaffFromForm(card);
  assert.equal(staff.length, 0);
  assert.equal(getIncompleteRowWarnings().length, 0);
});

test("collectServicesFromForm reads back service rows and warns on incomplete ones", () => {
  const card = freshContainer();
  card.innerHTML = `<div class="room-services-list"></div>`;
  const servicesList = card.querySelector(".room-services-list") as HTMLElement;
  addServiceRow(servicesList, "service-location-projecteur", 1, 3, "tarif-location-projecteur");
  addServiceRow(servicesList, "", 1, 2, ""); // incomplete: hours entered but no service chosen

  const services = collectServicesFromForm(card);
  assert.equal(services.length, 1);
  assert.equal(services[0].service_id, "service-location-projecteur");
  assert.equal(getIncompleteRowWarnings().length, 1);
});

test("collectFeesFromForm reads description/amount/gl_account_code and trims the description", () => {
  const card = freshContainer();
  card.innerHTML = `<div class="room-fees-list"></div>`;
  const feesList = card.querySelector(".room-fees-list") as HTMLElement;
  addFeeRow(feesList, "  Montage  ", 45, "GL-1");

  const fees = collectFeesFromForm(card);
  assert.equal(fees.length, 1);
  assert.equal(fees[0].description, "Montage");
  assert.equal(fees[0].amount, 45);
  assert.equal(fees[0].gl_account_code, "GL-1");
});

test("collectFeesFromForm drops a fee row with no description but warns since an amount was entered", () => {
  const card = freshContainer();
  card.innerHTML = `<div class="room-fees-list"></div>`;
  const feesList = card.querySelector(".room-fees-list") as HTMLElement;
  addFeeRow(feesList, "", 25, "");

  const fees = collectFeesFromForm(card);
  assert.equal(fees.length, 0);
  assert.equal(getIncompleteRowWarnings().length, 1);
});

test("autoAddTechnicalDirectorIfNeeded adds the technical director row once, and is a no-op if already present", () => {
  const staffList = freshContainer();
  autoAddTechnicalDirectorIfNeeded(staffList);
  assert.equal(staffList.querySelectorAll(".staff-salary-select").length, 1);

  autoAddTechnicalDirectorIfNeeded(staffList);
  assert.equal(staffList.querySelectorAll(".staff-salary-select").length, 1);

  const select = staffList.querySelector(".staff-salary-select") as HTMLSelectElement;
  assert.equal(select.value, TECHNICAL_DIRECTOR_SALARY_ID);
});

test("autoAddTechnicalDirectorIfNeeded does nothing when the technical director salary isn't configured", () => {
  setAppState(baseState({ settings: { ...baseState().settings, salaries: [] } }));
  const staffList = freshContainer();
  autoAddTechnicalDirectorIfNeeded(staffList);
  assert.equal(staffList.querySelectorAll(".staff-salary-select").length, 0);
});

test("autoAddProjectorIfNeeded adds the projector rental row once, and is a no-op if already present", () => {
  const servicesList = freshContainer();
  autoAddProjectorIfNeeded(servicesList);
  assert.equal(servicesList.querySelectorAll(".service-select").length, 1);

  autoAddProjectorIfNeeded(servicesList);
  assert.equal(servicesList.querySelectorAll(".service-select").length, 1);

  const select = servicesList.querySelector(".service-select") as HTMLSelectElement;
  assert.equal(select.value, PROJECTOR_SERVICE_ID);
  
  const wrapper = servicesList.querySelector(".distribution-row-wrapper") as HTMLElement;
  assert.equal(wrapper.dataset.autoGenerated, "1");
});

test("autoAddProjectorIfNeeded does nothing when the projector service isn't configured", () => {
  setAppState(baseState({ settings: { ...baseState().settings, services: [] } }));
  const servicesList = freshContainer();
  autoAddProjectorIfNeeded(servicesList);
  assert.equal(servicesList.querySelectorAll(".service-select").length, 0);
});

test("autoRemoveProjectorIfNeeded removes the projector rental row if it is auto-generated", () => {
  const servicesList = freshContainer();
  autoAddProjectorIfNeeded(servicesList);
  assert.equal(servicesList.querySelectorAll(".service-select").length, 1);

  autoRemoveProjectorIfNeeded(servicesList);
  assert.equal(servicesList.querySelectorAll(".service-select").length, 0);
});

test("autoRemoveProjectorIfNeeded does not remove the projector rental row if it was not auto-generated", () => {
  const servicesList = freshContainer();
  addServiceRow(servicesList, PROJECTOR_SERVICE_ID, 1, 0, "", false);
  assert.equal(servicesList.querySelectorAll(".service-select").length, 1);

  autoRemoveProjectorIfNeeded(servicesList);
  assert.equal(servicesList.querySelectorAll(".service-select").length, 1);
});

export {};
