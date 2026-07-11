import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG } from "../src/state/config-defaults.ts";
import { migrateRoomsConfig, migrateSalariesConfig, migrateServicesConfig } from "../src/state/migrations.ts";
import { validateBackupSchema } from "../src/services/backup.ts";

// Guards against the embedded seed config (config-defaults.ts) silently drifting out of sync
// with the shape migrations.ts produces and validateBackupSchema.ts expects, since nothing else
// exercises DEFAULT_CONFIG end-to-end.
test("DEFAULT_CONFIG survives migration and satisfies validateBackupSchema unchanged", () => {
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

  const rooms = config.rooms;
  migrateRoomsConfig(rooms);
  const salaries = config.salaries;
  migrateSalariesConfig(salaries);
  const services = config.services;
  migrateServicesConfig(services);

  const backup = {
    activities: [],
    settings: {
      rooms,
      salaries,
      services,
      accounts: config.accounts
    },
    favorites: [],
    selected_quarters: [1, 2, 3, 4]
  };

  const validation = validateBackupSchema(backup);
  assert.equal(validation.valid, true, validation.error || "expected valid backup");
});

test("migrateRoomsConfig on DEFAULT_CONFIG rooms is a no-op (already-migrated pricing_grids untouched)", () => {
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  const before = JSON.parse(JSON.stringify(config.rooms));
  migrateRoomsConfig(config.rooms);
  assert.deepEqual(config.rooms, before);
});

test("migrateSalariesConfig and migrateServicesConfig on DEFAULT_CONFIG entries are a no-op (already using tarifs[])", () => {
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  const salariesBefore = JSON.parse(JSON.stringify(config.salaries));
  const servicesBefore = JSON.parse(JSON.stringify(config.services));

  migrateSalariesConfig(config.salaries);
  migrateServicesConfig(config.services);

  assert.deepEqual(config.salaries, salariesBefore);
  assert.deepEqual(config.services, servicesBefore);
});

export {};
