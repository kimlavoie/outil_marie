import test from "node:test";
import assert from "node:assert/strict";
import { computeBackupDiff, detectActivityChanges } from "../../src/services/backup/diff.ts";
import { AppState } from "../../src/types/index.ts";

function createDummyState(overrides: Partial<AppState> = {}): AppState {
  return {
    settings: {
      theme: "dark",
      rooms: [{ id: "r1", name: "Salle A" }],
      departments: ["Dep1"],
      accounts: [{ code: "1000", name: "Compte A" }],
      last_backup_date: "2026-01-01",
      backup_reminder_days: 7,
      salaries: [{ id: "s1", title: "Technicien", hourly_rate: 25 }],
      services: [],
      global_tasks: [],
      schedulable_tasks: [],
      tax_rates: { tps: 0.05, tvq: 0.09975 }
    },
    activities: [
      {
        id: "act-1",
        name: "Activité 1",
        state: "brouillon",
        date_start: "2026-05-01",
        date_end: "2026-05-02"
      },
      {
        id: "act-2",
        name: "Activité 2",
        state: "facture",
        date_start: "2026-06-01"
      }
    ],
    favorites: ["act-1"],
    selected_year: "2026",
    selected_quarters: [1, 2, 3, 4],
    ...overrides
  } as AppState;
}

test("detectActivityChanges identifies modified fields correctly", () => {
  const actBase = { id: "act-1", name: "Original", state: "brouillon", date_start: "2026-01-01" };
  const actModified = { id: "act-1", name: "Modifié", state: "facture", date_start: "2026-01-01" };

  const changes = detectActivityChanges(actModified as any, actBase as any);
  assert.deepEqual(changes, ["Nom", "Statut"]);
});

test("computeBackupDiff classifies added, modified, unchanged and app-only activities", () => {
  const currentState = createDummyState();
  const backup = {
    settings: JSON.parse(JSON.stringify(currentState.settings)),
    activities: [
      { id: "act-1", name: "Activité 1", state: "brouillon", date_start: "2026-05-01", date_end: "2026-05-02" }, // unchanged
      { id: "act-2", name: "Activité 2 Révisée", state: "facture", date_start: "2026-06-01" }, // modified
      { id: "act-3", name: "Nouvelle Activité", state: "approuve" } // added
    ]
  };

  const diff = computeBackupDiff(backup, currentState);

  assert.equal(diff.activities.summary.addedCount, 1);
  assert.equal(diff.activities.summary.modifiedCount, 1);
  assert.equal(diff.activities.summary.unchangedCount, 1);
  assert.equal(diff.activities.summary.appOnlyCount, 0);

  assert.equal(diff.activities.added[0].id, "act-3");
  assert.equal(diff.activities.modified[0].id, "act-2");
  assert.deepEqual(diff.activities.modified[0].changes, ["Nom"]);
  assert.equal(diff.activities.unchanged[0].id, "act-1");
});

test("computeBackupDiff detects app-only activities (missing in backup)", () => {
  const currentState = createDummyState({
    activities: [
      { id: "act-1", name: "Activité 1" },
      { id: "act-app-only", name: "Présent seulement dans l'app" }
    ] as any
  });
  const backup = {
    settings: currentState.settings,
    activities: [{ id: "act-1", name: "Activité 1" }]
  };

  const diff = computeBackupDiff(backup, currentState);

  assert.equal(diff.activities.summary.appOnlyCount, 1);
  assert.equal(diff.activities.appOnly[0].id, "act-app-only");
});

test("computeBackupDiff identifies modified configuration categories", () => {
  const currentState = createDummyState();
  const backup = {
    settings: {
      ...JSON.parse(JSON.stringify(currentState.settings)),
      rooms: [{ id: "r1", name: "Salle A" }, { id: "r2", name: "Salle B" }], // modified
      theme: "light" // modified preference
    },
    activities: currentState.activities
  };

  const diff = computeBackupDiff(backup, currentState);

  assert.equal(diff.configs.categories.rooms.isDifferent, true);
  assert.equal(diff.configs.categories.rooms.backupCount, 2);
  assert.equal(diff.configs.categories.rooms.currentCount, 1);

  assert.equal(diff.configs.categories.preferences.isDifferent, true);
  assert.equal(diff.configs.categories.salaries.isDifferent, false);

  assert.equal(diff.configs.modifiedCount, 2);
});
