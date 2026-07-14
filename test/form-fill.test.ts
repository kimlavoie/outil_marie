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
import { fillActivityFormFields } from "../src/activities/form.ts";

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

// Minimal DOM skeleton covering every element fillActivityFormFields (and the tab/planning/
// distribution helpers it calls) touches unconditionally. Elements guarded by an `if (el)` check
// in the source (file-link status, dates helper, room conflicts banner, billing status) are
// deliberately left out since they're optional there too.
function setupFormSkeleton() {
  document.body.innerHTML = `
    <div id="activity-mode-toggle">
      <button type="button" class="pill-toggle" data-mode="estimation"></button>
      <button type="button" class="pill-toggle" data-mode="soumission"></button>
    </div>
    <div id="activity-tab-panel-submission"></div>
    <div id="activity-mode-group"></div>

    <input id="form-activity-coba">
    <input id="form-activity-name">
    <input id="form-activity-attendees">
    <input type="checkbox" id="form-activity-responsable-same-as-manager">
    <input id="form-activity-responsable-firstname">
    <input id="form-activity-responsable-lastname">
    <select id="form-activity-client-type">
      <option value=""></option>
      <option value="interne">Interne</option>
      <option value="externe">Externe</option>
    </select>
    <textarea id="form-activity-description"></textarea>
    <textarea id="form-activity-notes"></textarea>
    <input id="form-activity-manager-firstname">
    <input id="form-activity-manager-lastname">
    <select id="form-activity-manager-type">
      <option value="employe">Employé</option>
      <option value="externe">Externe</option>
    </select>
    <input id="form-activity-manager-phone">
    <input id="form-activity-manager-email">
    <input id="form-activity-manager-company">
    <input id="form-activity-manager-coba-client-number">
    <input id="form-activity-manager-address">
    <input id="form-activity-manager-city">
    <input id="form-activity-manager-province">
    <input id="form-activity-manager-postal-code">
    <div id="form-activity-manager-external-group"></div>

    <div id="form-activity-reservations"></div>

    <select id="form-activity-dept">
      <option value=""></option>
      <option value="DG">Direction générale</option>
    </select>
    <select id="form-activity-event-type">
      <option value=""></option>
      <option value="conference">Conférence</option>
      <option value="autre">Autre</option>
    </select>
    <input id="form-activity-event-type-other">
    <div id="form-activity-event-type-other-group"></div>

    <div id="form-distribution-list"></div>

    <div id="planning-tasks-list"></div>
    <button id="generate-planning-tasks-btn"></button>
    <div id="planning-progress-bar-container"></div>
    <div id="planning-progress-label"></div>

    <div id="submission-financial-summary"></div>
    <div id="form-distribution-total-val"></div>
    <div id="form-distribution-total-warning"></div>
  `;
}

const ACTIVITY = {
  id: "act-1",
  mode: "soumission",
  state: "soumise", // not "brouillon": mode toggle should be locked
  coba: "COBA-123",
  name: "Conférence Test",
  attendees_count: 42,
  responsable_first_name: "Jean",
  responsable_last_name: "Tremblay",
  client_type: "externe",
  description: "Une description détaillée",
  notes: "Prévoir du café",
  activity_manager: {
    first_name: "Marie",
    last_name: "Gérante",
    type: "externe",
    phone: "418-555-1234",
    email: "marie@example.com",
    company_name: "Entreprise Inc.",
    coba_client_number: "CL-99",
    address: "123 rue Principale",
    city: "Saguenay",
    province: "QC",
    postal_code: "G7X 1X1"
  },
  reservations: [] as any[],
  department: "DG",
  event_type: "autre",
  event_type_other: "Vernissage",
  distributions: [{ account_code: "GL-1", amount: 100, reference: "RI-001", details: "Détail" }],
  planning_tasks: [] as any[]
};

test.beforeEach(() => {
  setAppState(baseState());
  setupFormSkeleton();
});

function val(id: string) {
  return (document.getElementById(id) as HTMLInputElement).value;
}

test("fillActivityFormFields binds the top-level and manager fields onto the form", () => {
  fillActivityFormFields(ACTIVITY);

  assert.equal(val("form-activity-coba"), "COBA-123");
  assert.equal(val("form-activity-name"), "Conférence Test");
  assert.equal(val("form-activity-attendees"), "42");
  assert.equal(val("form-activity-responsable-firstname"), "Jean");
  assert.equal(val("form-activity-responsable-lastname"), "Tremblay");
  assert.equal(val("form-activity-client-type"), "externe");
  assert.equal(val("form-activity-description"), "Une description détaillée");
  assert.equal(val("form-activity-notes"), "Prévoir du café");

  assert.equal(val("form-activity-manager-firstname"), "Marie");
  assert.equal(val("form-activity-manager-lastname"), "Gérante");
  assert.equal(val("form-activity-manager-type"), "externe");
  assert.equal(val("form-activity-manager-phone"), "418-555-1234");
  assert.equal(val("form-activity-manager-email"), "marie@example.com");
  assert.equal(val("form-activity-manager-company"), "Entreprise Inc.");
  assert.equal(val("form-activity-manager-coba-client-number"), "CL-99");
  assert.equal(val("form-activity-manager-address"), "123 rue Principale");
  assert.equal(val("form-activity-manager-city"), "Saguenay");
  assert.equal(val("form-activity-manager-province"), "QC");
  assert.equal(val("form-activity-manager-postal-code"), "G7X 1X1");
  assert.equal(document.getElementById("form-activity-manager-external-group")!.style.display, "block");

  assert.equal(val("form-activity-dept"), "DG");
  assert.equal(val("form-activity-event-type"), "autre");
  assert.equal(val("form-activity-event-type-other"), "Vernissage");
  assert.equal(document.getElementById("form-activity-event-type-other-group")!.style.display, "flex");
});

test("fillActivityFormFields defaults manager fields to blank/employe and hides the external group when there is no manager", () => {
  fillActivityFormFields({ ...ACTIVITY, activity_manager: undefined });

  assert.equal(val("form-activity-manager-firstname"), "");
  assert.equal(val("form-activity-manager-type"), "employe");
  assert.equal(document.getElementById("form-activity-manager-external-group")!.style.display, "none");
});

test("fillActivityFormFields applies the mode toggle and locks it once the activity is past brouillon", () => {
  fillActivityFormFields(ACTIVITY); // state: "soumise"

  const toggle = document.getElementById("activity-mode-toggle")!;
  const estimationBtn = toggle.querySelector('[data-mode="estimation"]') as HTMLButtonElement;
  const soumissionBtn = toggle.querySelector('[data-mode="soumission"]') as HTMLButtonElement;
  assert.equal(soumissionBtn.classList.contains("active"), true);
  assert.equal(estimationBtn.classList.contains("active"), false);
  assert.equal(soumissionBtn.disabled, true);
  assert.equal(document.getElementById("activity-mode-group")!.style.display, "none");
});

test("fillActivityFormFields leaves the mode toggle unlocked for a brouillon activity", () => {
  fillActivityFormFields({ ...ACTIVITY, state: "brouillon", mode: "estimation" });

  const toggle = document.getElementById("activity-mode-toggle")!;
  const estimationBtn = toggle.querySelector('[data-mode="estimation"]') as HTMLButtonElement;
  assert.equal(estimationBtn.classList.contains("active"), true);
  assert.equal(estimationBtn.disabled, false);
  assert.equal(document.getElementById("activity-mode-group")!.style.display, "block");
});

test("fillActivityFormFields auto-adds a blank reservation card (with one slot) when the activity has none yet", () => {
  fillActivityFormFields({ ...ACTIVITY, reservations: [] });

  const cards = document.querySelectorAll("#form-activity-reservations .reservation-card");
  assert.equal(cards.length, 1);
  assert.equal(cards[0].querySelectorAll(".reservation-slot-row").length, 1);
});

test("fillActivityFormFields loads the activity's distributions as GL distribution rows", () => {
  fillActivityFormFields(ACTIVITY);

  const rows = document.querySelectorAll("#form-distribution-list .distribution-row");
  assert.equal(rows.length, 1);
  assert.equal((rows[0].querySelector(".dist-amount-input") as HTMLInputElement).value, "100");
  assert.equal((rows[0].querySelector(".dist-reference-input") as HTMLInputElement).value, "RI-001");
  assert.equal((rows[0].querySelector(".dist-details-input") as HTMLInputElement).value, "Détail");
});

test("fillActivityFormFields clears and repopulates the planning tab from planning_tasks", () => {
  fillActivityFormFields({ ...ACTIVITY, planning_tasks: [{ id: "task-1", description: "Réserver le traiteur", done: false }] });

  const rows = document.querySelectorAll("#planning-tasks-list .distribution-row");
  assert.equal(rows.length, 1);
  assert.equal((rows[0].querySelector(".task-desc-input") as HTMLInputElement).value, "Réserver le traiteur");
  assert.equal((document.getElementById("generate-planning-tasks-btn") as HTMLButtonElement).disabled, true);
});

export {};
