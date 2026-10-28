import test from "node:test";
import assert from "node:assert/strict";

import {
  ACTIVITY_STATES,
  getActivityStateLabel,
  getActivityStateBadgeClass,
  getPlanningProgress,
  getTotalHostesses
} from "../src/components/activities/activity-state-helpers.ts";

test("getActivityStateLabel returns the matching label, or the first (brouillon) one as fallback", () => {
  assert.equal(getActivityStateLabel("terminee"), "Terminée");
  assert.equal(getActivityStateLabel("facturee"), "Facturée");
  assert.equal(getActivityStateLabel("unknown-state"), ACTIVITY_STATES[0].label);
});

test("getActivityStateBadgeClass maps each known state to its badge color, defaulting to danger", () => {
  assert.equal(getActivityStateBadgeClass("terminee"), "badge-success");
  assert.equal(getActivityStateBadgeClass("facturee"), "badge-info");
  assert.equal(getActivityStateBadgeClass("planifiee"), "badge-info");
  assert.equal(getActivityStateBadgeClass("approuvee"), "badge-warning");
  assert.equal(getActivityStateBadgeClass("soumise"), "badge-warning");
  assert.equal(getActivityStateBadgeClass("brouillon"), "badge-danger");
  assert.equal(getActivityStateBadgeClass("anything-else"), "badge-danger");
});

test("getPlanningProgress counts done/total tasks and rounds the percentage", () => {
  assert.deepEqual(getPlanningProgress({ planning_tasks: [] } as any), { done: 0, total: 0, percent: 0 });
  assert.deepEqual(
    getPlanningProgress({ planning_tasks: [{ done: true }, { done: false }, { done: true }] } as any),
    { done: 2, total: 3, percent: 67 }
  );
  assert.deepEqual(getPlanningProgress({} as any), { done: 0, total: 0, percent: 0 });
});

test("getTotalHostesses sums bar-service hostess_count plus staff rows on the hostess salary", () => {
  const act = {
    reservations: [
      { bar_service: { hostess_count: 2 }, staff: [{ salary_id: "salary-hote" }, { salary_id: "salary-other" }] },
      { bar_service: null, staff: [{ salary_id: "salary-hote" }] }
    ]
  } as any;
  assert.equal(getTotalHostesses(act), 4);
});

test("getTotalHostesses returns 0 for an activity with no reservations", () => {
  assert.equal(getTotalHostesses({} as any), 0);
  assert.equal(getTotalHostesses({ reservations: [] } as any), 0);
});
