import test from "node:test";
import assert from "node:assert/strict";

import { activityMatchesTask } from "../src/state/state.ts";

function makeActivity(overrides: any = {}): any {
  return {
    event_type: "conference",
    client_type: "externe",
    department: "COMMUNICATION",
    attendees_count: 150,
    reservations: [
      {
        room_name: "Salle Polyvalente (200.2)",
        technical_services: ["Microphone"],
        services: [{ service_id: "service-location-projecteur" }]
      }
    ],
    ...overrides
  };
}

function condition(field: string, operator: string, value: any) {
  return { id: `cond-${field}`, field, operator, value };
}

function task(groups: any[], groupsLogic: "AND" | "OR" = "AND") {
  return { id: "task-1", description: "Test task", groups_logic: groupsLogic, groups };
}

function group(conditions: any[], logic: "AND" | "OR" = "AND") {
  return { id: `group-${logic}-${conditions.length}`, logic, conditions };
}

test("activityMatchesTask returns false when there are no condition groups", () => {
  const act = makeActivity();
  assert.equal(activityMatchesTask(act, task([])), false);
});

test("activityMatchesTask returns false when a group has no conditions", () => {
  const act = makeActivity();
  assert.equal(activityMatchesTask(act, task([group([])])), false);
});

test("activityMatchesTask matches event_type with equals/not_equals", () => {
  const act = makeActivity({ event_type: "conference" });
  assert.equal(activityMatchesTask(act, task([group([condition("event_type", "equals", "conference")])])), true);
  assert.equal(activityMatchesTask(act, task([group([condition("event_type", "equals", "spectacle")])])), false);
  assert.equal(activityMatchesTask(act, task([group([condition("event_type", "not_equals", "spectacle")])])), true);
  assert.equal(activityMatchesTask(act, task([group([condition("event_type", "not_equals", "conference")])])), false);
});

test("activityMatchesTask matches client_type and department", () => {
  const act = makeActivity({ client_type: "interne", department: "BICQ" });
  assert.equal(activityMatchesTask(act, task([group([condition("client_type", "equals", "interne")])])), true);
  assert.equal(activityMatchesTask(act, task([group([condition("client_type", "equals", "externe")])])), false);
  assert.equal(activityMatchesTask(act, task([group([condition("department", "equals", "BICQ")])])), true);
  assert.equal(activityMatchesTask(act, task([group([condition("department", "not_equals", "BICQ")])])), false);
});

test("activityMatchesTask compares attendees_count with gte/lte/equals", () => {
  const act = makeActivity({ attendees_count: 100 });
  assert.equal(activityMatchesTask(act, task([group([condition("attendees_count", "gte", 100)])])), true);
  assert.equal(activityMatchesTask(act, task([group([condition("attendees_count", "gte", 101)])])), false);
  assert.equal(activityMatchesTask(act, task([group([condition("attendees_count", "lte", 100)])])), true);
  assert.equal(activityMatchesTask(act, task([group([condition("attendees_count", "lte", 99)])])), false);
  assert.equal(activityMatchesTask(act, task([group([condition("attendees_count", "equals", 100)])])), true);
  assert.equal(activityMatchesTask(act, task([group([condition("attendees_count", "equals", 99)])])), false);
});

test("activityMatchesTask matches room/technical_service/service against any reservation", () => {
  const act = makeActivity({
    reservations: [
      { room_name: "Salle A", technical_services: ["Microphone"], services: [{ service_id: "svc-1" }] },
      { room_name: "Salle B", technical_services: [], services: [{ service_id: "svc-2" }] }
    ]
  });
  assert.equal(activityMatchesTask(act, task([group([condition("room", "equals", "Salle B")])])), true);
  assert.equal(activityMatchesTask(act, task([group([condition("room", "equals", "Salle C")])])), false);
  assert.equal(activityMatchesTask(act, task([group([condition("room", "not_equals", "Salle C")])])), true);
  assert.equal(activityMatchesTask(act, task([group([condition("technical_service", "equals", "Microphone")])])), true);
  assert.equal(activityMatchesTask(act, task([group([condition("technical_service", "equals", "Éclairage de scène")])])), false);
  assert.equal(activityMatchesTask(act, task([group([condition("service", "equals", "svc-2")])])), true);
  assert.equal(activityMatchesTask(act, task([group([condition("service", "equals", "svc-3")])])), false);
});

test("activityMatchesTask returns false for room/technical_service/service when there are no reservations", () => {
  const act = makeActivity({ reservations: [] });
  assert.equal(activityMatchesTask(act, task([group([condition("room", "equals", "Salle A")])])), false);
  assert.equal(activityMatchesTask(act, task([group([condition("technical_service", "equals", "Microphone")])])), false);
  assert.equal(activityMatchesTask(act, task([group([condition("service", "equals", "svc-1")])])), false);
});

test("activityMatchesTask AND group requires every condition in that group to match", () => {
  const act = makeActivity({ event_type: "conference", attendees_count: 150 });
  const g = group([condition("event_type", "equals", "conference"), condition("attendees_count", "gte", 100)], "AND");
  assert.equal(activityMatchesTask(act, task([g])), true);

  const gFail = group([condition("event_type", "equals", "conference"), condition("attendees_count", "gte", 200)], "AND");
  assert.equal(activityMatchesTask(act, task([gFail])), false);
});

test("activityMatchesTask OR group matches if any condition in that group matches", () => {
  const act = makeActivity({ event_type: "spectacle", attendees_count: 5 });
  const g = group([condition("event_type", "equals", "conference"), condition("attendees_count", "gte", 100)], "OR");
  assert.equal(activityMatchesTask(act, task([g])), false);

  const gMatch = group([condition("event_type", "equals", "spectacle"), condition("attendees_count", "gte", 100)], "OR");
  assert.equal(activityMatchesTask(act, task([gMatch])), true);
});

test("activityMatchesTask combines multiple groups with groups_logic AND", () => {
  const act = makeActivity({ event_type: "conference", department: "COMMUNICATION" });
  const g1 = group([condition("event_type", "equals", "conference")]);
  const g2 = group([condition("department", "equals", "COMMUNICATION")]);
  assert.equal(activityMatchesTask(act, task([g1, g2], "AND")), true);

  const g3 = group([condition("department", "equals", "BICQ")]);
  assert.equal(activityMatchesTask(act, task([g1, g3], "AND")), false);
});

test("activityMatchesTask combines multiple groups with groups_logic OR", () => {
  const act = makeActivity({ event_type: "conference", department: "COMMUNICATION" });
  const g1 = group([condition("event_type", "equals", "spectacle")]);
  const g2 = group([condition("department", "equals", "COMMUNICATION")]);
  assert.equal(activityMatchesTask(act, task([g1, g2], "OR")), true);

  const g3 = group([condition("department", "equals", "BICQ")]);
  assert.equal(activityMatchesTask(act, task([g1, g3], "OR")), false);
});
