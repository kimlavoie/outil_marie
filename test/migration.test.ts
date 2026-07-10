import test from "node:test";
import assert from "node:assert/strict";
import "./indexeddb-mock.ts";

// Mock document: showToast() no-ops without a #toast-container, and setAppState/loadDatabase
// don't otherwise touch the DOM in these tests.
(globalThis as any).document = { getElementById: () => null };

import {
  migrateActivities,
  migrateRoomsConfig,
  migrateSalariesConfig,
  migrateServicesConfig,
  loadDatabase,
  saveAppStateToDb,
  getSafetyBackupsFromDb,
  appState,
  DEFAULT_CONFIG
} from "../src/state/state.ts";

function freshSettings(overrides: any = {}) {
  return {
    theme: "dark",
    rooms: [],
    salaries: [],
    services: [],
    global_tasks: [],
    schedulable_tasks: [],
    departments: [],
    accounts: [],
    last_backup_date: "",
    backup_reminder_days: 7,
    ...overrides
  };
}

test("migrateActivities correctly migrates legacy room_name to reservations format", () => {
  const settings = freshSettings({
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
    ]
  });

  const activities = [
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

  migrateActivities(activities, settings);

  const migrated = activities[0] as any;

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
  const activities = [
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

  migrateActivities(activities, freshSettings());

  const migrated = activities[0] as any;

  // Verify activity-level reference is deleted
  assert.equal(migrated.reference, undefined);

  // Verify distribution references
  assert.equal(migrated.distributions[0].reference, "RI-12345"); // Broadcasted
  assert.equal(migrated.distributions[1].reference, "RI-already-exists"); // Preserved
});

test("migrateRoomsConfig does nothing and does not throw when there are no rooms", () => {
  const rooms: any[] = [];
  assert.doesNotThrow(() => migrateRoomsConfig(rooms));
  assert.deepEqual(rooms, []);
});

test("migrateRoomsConfig builds a pricing grid from legacy price_internal/price_external", () => {
  const rooms = [{ name: "Salle A", price_internal: 100, price_external: 150 } as any];

  migrateRoomsConfig(rooms);

  const room = rooms[0];
  assert.equal(room.price_internal, undefined);
  assert.equal(room.price_external, undefined);
  assert.equal(room.tarifs, undefined); // tarifs is always a transient step, deleted after migration
  assert.equal(room.pricing_grids.length, 1);
  const grid = room.pricing_grids[0];
  assert.equal(grid.client_types.length, 2); // Interne + Externe
  assert.deepEqual(
    grid.cells.map((c: any) => c.amount),
    [100, 150]
  );
});

test("migrateRoomsConfig leaves an existing pricing_grids untouched and still drops legacy tarifs", () => {
  const rooms = [
    {
      name: "Salle B",
      // Legacy leftover tarifs alongside an already-migrated pricing_grids: pricing_grids wins.
      tarifs: [{ id: "t1", description: "Interne", amount: 999 }] as any,
      pricing_grids: [
        {
          effective_date: "",
          parameters: [{ id: "p1", name: "Tarif" }],
          client_types: [{ id: "ct1", name: "Interne" }],
          cells: [{ parameter_id: "p1", client_type_id: "ct1", amount: 42 }]
        }
      ]
    } as any
  ];

  migrateRoomsConfig(rooms);

  const room = rooms[0];
  assert.equal(room.pricing_grids.length, 1);
  assert.equal(room.pricing_grids[0].cells[0].amount, 42); // untouched, not rebuilt from tarifs
  assert.equal(room.tarifs, undefined); // always dropped, even though it was ignored above
});

test("migrateRoomsConfig treats a null pricing_grids like a missing one and rebuilds it", () => {
  const rooms = [{ name: "Salle C", pricing_grids: null, tarifs: [{ id: "t1", description: "Interne", amount: 75 }] } as any];

  migrateRoomsConfig(rooms);

  const room = rooms[0];
  assert.equal(room.pricing_grids.length, 1);
  assert.equal(room.pricing_grids[0].cells[0].amount, 75);
});

test("migrateRoomsConfig always ensures linked_* arrays exist", () => {
  const rooms = [{ name: "Salle D", pricing_grids: [] } as any];
  migrateRoomsConfig(rooms);
  const room = rooms[0];
  assert.deepEqual(room.linked_rooms, []);
  assert.deepEqual(room.linked_staff, []);
  assert.deepEqual(room.linked_fees, []);
  assert.deepEqual(room.linked_tasks, []);
});

// --- migrateSalariesConfig ---

test("migrateSalariesConfig moves legacy rate/gl_account_code into tarifs[], defaulting overtime_rate to 0", () => {
  const salaries = [{ name: "Hôte", rate: 20, gl_account_code: "892-001" } as any];

  migrateSalariesConfig(salaries);

  const sal = salaries[0];
  assert.equal((sal as any).rate, undefined);
  assert.equal((sal as any).gl_account_code, undefined);
  assert.equal((sal as any).rate_versions, undefined); // moved under the tarif, not left at top level
  assert.equal(sal.tarifs.length, 1);
  const tarif = sal.tarifs[0];
  assert.equal(tarif.gl_account_code, "892-001");
  assert.equal(tarif.rate_versions.length, 1);
  assert.equal(tarif.rate_versions[0].rate, 20);
  assert.equal(tarif.rate_versions[0].overtime_rate, 0);
});

test("migrateSalariesConfig fills in missing overtime_rate on existing rate_versions without a gl_account_code", () => {
  const salaries = [{ name: "Sauveteur", rate_versions: [{ effective_date: "", rate: 25 }] } as any];

  migrateSalariesConfig(salaries);

  const tarif = salaries[0].tarifs[0];
  assert.equal(tarif.gl_account_code, "");
  assert.equal(tarif.rate_versions[0].rate, 25);
  assert.equal(tarif.rate_versions[0].overtime_rate, 0);
});

test("migrateSalariesConfig leaves a salary that already has tarifs untouched", () => {
  const existingTarifs = [{ id: "t1", label: "", gl_account_code: "111", rate_versions: [{ effective_date: "", rate: 99 }] }];
  const salaries = [{ name: "Déjà migré", tarifs: existingTarifs } as any];

  migrateSalariesConfig(salaries);

  assert.strictEqual(salaries[0].tarifs, existingTarifs);
});

// --- migrateServicesConfig ---

test("migrateServicesConfig adds missing default services without touching an already-customized one", () => {
  const customizedDefault = JSON.parse(JSON.stringify(DEFAULT_CONFIG.services[0]));
  customizedDefault.tarifs[0].rate_versions[0].rate = 12345; // user-edited amount

  const services = [customizedDefault];

  migrateServicesConfig(services);

  // Every default service id is present...
  DEFAULT_CONFIG.services.forEach(def => {
    assert.ok(services.some((s: any) => s.id === def.id));
  });
  // ...but the customized one keeps the user's amount instead of being overwritten.
  const kept = services.find((s: any) => s.id === customizedDefault.id);
  assert.equal(kept.tarifs[0].rate_versions[0].rate, 12345);
});

test("migrateServicesConfig migrates a legacy single gl_account_code into tarifs[]", () => {
  const services = [
    { id: "svc-custom", name: "Service perso", gl_account_code: "700-100", rate_versions: [{ effective_date: "", rate: 40 }] } as any
  ];

  migrateServicesConfig(services);

  const svc = services.find((s: any) => s.id === "svc-custom");
  assert.equal(svc.gl_account_code, undefined);
  assert.equal(svc.billing_accounts, undefined);
  assert.equal(svc.rate_versions, undefined);
  assert.equal(svc.tarifs.length, 1);
  assert.equal(svc.tarifs[0].gl_account_code, "700-100");
  assert.equal(svc.tarifs[0].rate_versions[0].rate, 40);
});

test("migrateServicesConfig migrates several legacy billing_accounts into one tarif each, sharing the same rate history", () => {
  const services = [
    {
      id: "svc-multi",
      name: "Service multi-comptes",
      billing_accounts: [
        { id: "b1", label: "Interne", gl_account_code: "111" },
        { id: "b2", label: "Externe", gl_account_code: "222" }
      ],
      rate_versions: [{ effective_date: "", rate: 60 }]
    } as any
  ];

  migrateServicesConfig(services);

  const svc = services.find((s: any) => s.id === "svc-multi");
  assert.equal(svc.tarifs.length, 2);
  assert.deepEqual(
    svc.tarifs.map((t: any) => t.gl_account_code),
    ["111", "222"]
  );
  assert.equal(svc.tarifs[0].rate_versions[0].rate, 60);
  assert.equal(svc.tarifs[1].rate_versions[0].rate, 60);
  // Each tarif's rate_versions is its own copy, not a shared reference (later edits to one
  // tarif's rate history must not silently change the other's).
  assert.notStrictEqual(svc.tarifs[0].rate_versions, svc.tarifs[1].rate_versions);
});

// --- loadDatabase: the migration guard-rail (state.ts) ---
//
// migrateRoomsConfig/migrateSalariesConfig/migrateServicesConfig/migrateActivities all run
// inside their own try/catch in loadDatabase(), separate from the outer one that falls back to
// seedDatabase() (which wipes everything). A migration bug must instead roll appState back to
// the as-loaded, unmigrated data — these tests exercise that guard end-to-end through the real
// IndexedDB read/write path (mocked), not just the individual migration functions in isolation,
// so they still go through the shared appState (that's what loadDatabase() itself mutates).

test("loadDatabase rolls back to pre-migration data when a migration throws", async () => {
  const legacyActivity = { id: "act-1", name: "Legacy Event", distributions: [], reservations: [] };
  await saveAppStateToDb({
    // A null entry in rooms isn't a shape migrateRoomsConfig guards against (it only checks
    // room.tarifs/room.pricing_grids on the assumption room is an object) - a realistic stand-in
    // for "a migration throws on corrupted/unexpected data" without needing to fake a bug.
    settings: freshSettings({ rooms: [null] }),
    activities: [legacyActivity],
    favorites: [],
    selected_quarters: [1, 2, 3, 4]
  });

  await loadDatabase();

  // Rolled back: the corrupted room is still there verbatim (never reached migrateActivities,
  // so it never got the chance to touch anything else either).
  assert.equal(appState.settings.rooms.length, 1);
  assert.equal(appState.settings.rooms[0], null);
  assert.equal(appState.activities.length, 1);
  assert.equal(appState.activities[0].id, "act-1");
  // Confirms the migration never ran: a successfully migrated activity would have `rooms: []`.
  assert.equal((appState.activities[0] as any).rooms, undefined);
});

test("loadDatabase takes a safety backup before attempting migration, even when migration then fails", async () => {
  await saveAppStateToDb({
    settings: freshSettings({ rooms: [null] }),
    activities: [{ id: "act-2", name: "Another Event", distributions: [], reservations: [] }],
    favorites: [],
    selected_quarters: [1, 2, 3, 4]
  });

  const before = (await getSafetyBackupsFromDb()).length;
  await loadDatabase();
  const after = await getSafetyBackupsFromDb();

  assert.equal(after.length, before + 1);
  assert.equal(after[0].label, "migration");
});

test("loadDatabase applies migrations normally end-to-end when nothing is corrupted", async () => {
  await saveAppStateToDb({
    settings: freshSettings(),
    activities: [
      { id: "act-3", name: "Clean legacy activity", room_name: "", distributions: [], reservations: undefined as any }
    ],
    favorites: [],
    selected_quarters: [1, 2, 3, 4]
  });

  await loadDatabase();

  const migrated = appState.activities.find(a => a.id === "act-3");
  assert.ok(migrated);
  // room_name -> rooms is one of migrateActivities' jobs; seeing it applied confirms the guard
  // didn't roll back a migration that actually succeeded.
  assert.equal((migrated as any).room_name, undefined);
  assert.deepEqual((migrated as any).rooms, []);
});

export {};
