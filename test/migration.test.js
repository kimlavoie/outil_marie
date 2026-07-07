import test from "node:test";
import assert from "node:assert/strict";

// Mock the required globals before importing/executing state migrations
import { generateUid, calculateDaysCount } from "../js/utils.js";
global.generateUid = generateUid;
global.calculateDaysCount = calculateDaysCount;

import { migrateActivities, appState } from "../js/state.js";

test("migrateActivities correctly migrates legacy room_name to reservations format", () => {
  // Setup legacy settings
  appState.settings = {
    rooms: [
      {
        name: "Salle François-Brassard (326.1)",
        pricing_grids: [
          {
            effective_date: "",
            parameters: [{ id: "param-1", name: "Tarif" }],
            client_types: [{ id: "ct-interne", name: "Interne" }],
            cells: [{ parameter_id: "param-1", client_type_id: "ct-interne", amount: 120 }]
          }
        ],
        linked_rooms: [],
        linked_staff: [],
        linked_fees: [],
        linked_tasks: []
      }
    ],
    salaries: [],
    services: []
  };

  // Setup legacy activity
  appState.activities = [
    {
      id: "act-legacy-1",
      name: "Legacy Event",
      room_name: "Salle François-Brassard (326.1)",
      client_type: "interne",
      date_start: "2025-08-01",
      date_end: "2025-08-02",
      attendees_count: 50,
      install_date: "2025-08-01",
      install_time: "08:00",
      dismantle_date: "2025-08-02",
      dismantle_time: "17:00",
      start_time: "09:00",
      end_time: "16:00",
      distributions: [],
      // Legacy staff/services/fees directly on activity
      staff: [{ job: "Hôte", hours: 4 }],
      services: [{ name: "Piano à queue", quantity: 1 }],
      fees: [{ description: "Café", amount: 15 }]
    }
  ];

  migrateActivities();

  const migrated = appState.activities[0];
  
  // Verify room name is deleted
  assert.equal(migrated.room_name, undefined);

  // Verify reservations array is created
  assert.ok(Array.isArray(migrated.reservations));
  assert.equal(migrated.reservations.length, 1);

  const res = migrated.reservations[0];
  assert.equal(res.room_name, "Salle François-Brassard (326.1)");
  assert.equal(res.tariff_amount, 120); // Extracted from active pricing grid

  // Verify slots are generated for both days
  assert.equal(res.slots.length, 2);
  assert.equal(res.slots[0].date, "2025-08-01");
  assert.equal(res.slots[1].date, "2025-08-02");

  // Verify staff, services, and fees were moved to the reservation
  assert.equal(res.staff.length, 1);
  assert.equal(res.staff[0].job, "Hôte");
  assert.equal(res.services.length, 1);
  assert.equal(res.services[0].name, "Piano à queue");
  assert.equal(res.fees.length, 1);
  assert.equal(res.fees[0].description, "Café");

  // Verify activity level arrays were cleaned up
  assert.equal(migrated.staff, undefined);
  assert.equal(migrated.services, undefined);
  assert.equal(migrated.fees, undefined);
});

test("migrateActivities broadcast legacy activity-level reference onto distributions", () => {
  appState.activities = [
    {
      id: "act-legacy-ref",
      name: "Legacy Ref Event",
      reference: "RI-12345",
      distributions: [
        { account_code: "892-001", amount: 100 },
        { account_code: "892-002", amount: 50, reference: "RI-already-exists" }
      ]
    }
  ];

  migrateActivities();

  const migrated = appState.activities[0];

  // Verify activity-level reference is deleted
  assert.equal(migrated.reference, undefined);

  // Verify distribution references
  assert.equal(migrated.distributions[0].reference, "RI-12345"); // Broadcasted
  assert.equal(migrated.distributions[1].reference, "RI-already-exists"); // Preserved
});
