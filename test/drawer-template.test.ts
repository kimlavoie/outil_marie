import test from "node:test";
import assert from "node:assert/strict";
import { dom } from "./dom-mock.ts";

test.after(() => dom.window.close());

import { renderActivityDrawerShell } from "../src/activities/drawer-template.ts";

// Ids that other modules (form.ts, financials.ts, drawer.ts, reservations.ts, history.ts,
// file-links.ts...) look up directly via document.getElementById/querySelector — a rename here
// without updating those callers would fail silently at runtime instead of at compile time.
const REQUIRED_IDS = [
  "activity-drawer-title",
  "auto-save-status",
  "activity-drawer-close",
  "activity-state-bar",
  "activity-form",
  "form-activity-internal-id",
  "activity-mode-toggle",
  "form-activity-id",
  "form-activity-name",
  "form-activity-reservations",
  "add-reservation-btn",
  "submission-financial-summary",
  "submission-file-status",
  "contract-file-status",
  "planning-tasks-list",
  "add-planning-task-btn",
  "form-distribution-list",
  "form-distribution-total-val",
  "billing-state-status",
  "activity-history-list",
  "form-activity-notes",
  "activity-drawer-submit",
  "activity-drawer-back-to-calendar-btn"
];

const REQUIRED_TAB_PANELS = ["form", "submission", "planning", "billing", "history", "notes"];

function setup() {
  document.body.innerHTML = `<div id="activity-drawer"></div>`;
}

test("renderActivityDrawerShell does nothing when the #activity-drawer container is missing", () => {
  document.body.innerHTML = "";
  assert.doesNotThrow(() => renderActivityDrawerShell());
  assert.equal(document.body.innerHTML, "");
});

test("renderActivityDrawerShell populates the container with the drawer markup", () => {
  setup();
  renderActivityDrawerShell();
  const container = document.getElementById("activity-drawer")!;
  assert.ok(container.innerHTML.trim().length > 0);
});

test("renderActivityDrawerShell renders every id relied on by other activity modules", () => {
  setup();
  renderActivityDrawerShell();
  for (const id of REQUIRED_IDS) {
    assert.ok(document.getElementById(id), `expected #${id} to be rendered`);
  }
});

test("renderActivityDrawerShell renders a tab panel and matching tab button for each activity tab", () => {
  setup();
  renderActivityDrawerShell();
  for (const tab of REQUIRED_TAB_PANELS) {
    assert.ok(document.getElementById(`activity-tab-panel-${tab}`), `expected panel for tab ${tab}`);
    assert.ok(document.querySelector(`[data-activity-tab="${tab}"]`), `expected tab button for tab ${tab}`);
  }
});

test("renderActivityDrawerShell marks the submission tab/panel as active by default", () => {
  setup();
  renderActivityDrawerShell();
  assert.ok(document.getElementById("activity-tab-panel-submission")!.classList.contains("active"));
  assert.ok(document.querySelector('[data-activity-tab="submission"]')!.classList.contains("active"));
});

test("renderActivityDrawerShell is idempotent (re-rendering replaces rather than duplicates content)", () => {
  setup();
  renderActivityDrawerShell();
  renderActivityDrawerShell();
  assert.equal(document.querySelectorAll("#activity-drawer-title").length, 1);
});
