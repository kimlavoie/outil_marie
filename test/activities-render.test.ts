import test from "node:test";
import assert from "node:assert/strict";
import "./indexeddb-mock.ts";

import {
  ACTIVITY_STATES,
  getActivityStateLabel,
  getActivityStateBadgeClass,
  getPlanningProgress,
  deriveActivityState,
  buildProgressBarHtml
} from "../src/activities/render.ts";

function activity(overrides: any = {}) {
  return {
    id: "act-1",
    planning_tasks: [],
    submission: {},
    contract: {},
    billed_at: "",
    completed_at: "",
    ...overrides
  };
}

test("getActivityStateLabel returns the matching label", () => {
  assert.equal(getActivityStateLabel("planifiee"), "Planifiée");
  assert.equal(getActivityStateLabel("terminee"), "Terminée");
});

test("getActivityStateLabel falls back to the first state for an unknown value", () => {
  assert.equal(getActivityStateLabel("bogus"), ACTIVITY_STATES[0].label);
});

test("getActivityStateBadgeClass maps each state to its badge class", () => {
  assert.equal(getActivityStateBadgeClass("terminee"), "badge-success");
  assert.equal(getActivityStateBadgeClass("facturee"), "badge-info");
  assert.equal(getActivityStateBadgeClass("planifiee"), "badge-info");
  assert.equal(getActivityStateBadgeClass("approuvee"), "badge-warning");
  assert.equal(getActivityStateBadgeClass("soumise"), "badge-warning");
  assert.equal(getActivityStateBadgeClass("brouillon"), "badge-danger");
  assert.equal(getActivityStateBadgeClass("bogus"), "badge-danger");
});

test("getPlanningProgress counts done vs total tasks and computes percent", () => {
  const act = activity({ planning_tasks: [{ done: true }, { done: false }, { done: true }] });
  assert.deepEqual(getPlanningProgress(act), { done: 2, total: 3, percent: 67 });
});

test("getPlanningProgress returns 0 percent when there are no tasks", () => {
  assert.deepEqual(getPlanningProgress(activity()), { done: 0, total: 0, percent: 0 });
});

test("deriveActivityState defaults to brouillon with no markers set", () => {
  assert.equal(deriveActivityState(activity()), "brouillon");
});

test("deriveActivityState becomes soumise once the submission is sent", () => {
  const act = activity({ submission: { sent_at: "2025-08-01" } });
  assert.equal(deriveActivityState(act), "soumise");
});

test("deriveActivityState becomes approuvee once the contract is approved", () => {
  const act = activity({ contract: { approved_at: "2025-08-01" } });
  assert.equal(deriveActivityState(act), "approuvee");
});

test("deriveActivityState becomes planifiee once all planning tasks are done and submitted/approved", () => {
  const act = activity({
    submission: { sent_at: "2025-08-01" },
    planning_tasks: [{ done: true }, { done: true }]
  });
  assert.equal(deriveActivityState(act), "planifiee");
});

test("deriveActivityState does not reach planifiee if tasks are incomplete", () => {
  const act = activity({
    submission: { sent_at: "2025-08-01" },
    planning_tasks: [{ done: true }, { done: false }]
  });
  assert.equal(deriveActivityState(act), "soumise");
});

test("deriveActivityState does not reach planifiee without a submission or approval, even if tasks are done", () => {
  const act = activity({ planning_tasks: [{ done: true }] });
  assert.equal(deriveActivityState(act), "brouillon");
});

test("deriveActivityState becomes facturee once billed_at is set", () => {
  const act = activity({ billed_at: "2025-08-01" });
  assert.equal(deriveActivityState(act), "facturee");
});

test("deriveActivityState becomes terminee once completed_at is set", () => {
  const act = activity({ completed_at: "2025-08-01" });
  assert.equal(deriveActivityState(act), "terminee");
});

test("deriveActivityState falls back to the highest still-established stage when a later marker is unset", () => {
  // Billed then un-billed, but still submitted: should fall back to soumise, not brouillon.
  const act = activity({ submission: { sent_at: "2025-08-01" }, billed_at: "" });
  assert.equal(deriveActivityState(act), "soumise");
});

test("buildProgressBarHtml renders the given percent and marks completion at 100%", () => {
  const html = buildProgressBarHtml(50);
  assert.match(html, /width: 50%/);
  assert.doesNotMatch(html, /complete/);

  const complete = buildProgressBarHtml(100);
  assert.match(complete, /progress-bar-fill complete/);
});
