import test from "node:test";
import assert from "node:assert/strict";
import { validateBackupSchema, getDaysSinceLastBackup, formatLocalDateToFrench } from "../js/backup.js";
import { setAppState } from "../js/state.js";

test("validateBackupSchema returns valid=true for correct backup structures", () => {
  const correctBackup = {
    activities: [
      { id: "act-1", name: "Activité 1" }
    ],
    settings: {
      rooms: [],
      salaries: [],
      services: [],
      accounts: []
    },
    favorites: [],
    selected_quarters: [1, 2, 3, 4]
  };

  const validation = validateBackupSchema(correctBackup);
  assert.equal(validation.valid, true);
});

test("validateBackupSchema rejects null, arrays or non-object payloads", () => {
  assert.equal(validateBackupSchema(null).valid, false);
  assert.equal(validateBackupSchema([]).valid, false);
  assert.equal(validateBackupSchema("not-an-object").valid, false);
});

test("validateBackupSchema rejects backups missing activities array", () => {
  const incorrect = {
    settings: { rooms: [] }
  };
  const validation = validateBackupSchema(incorrect);
  assert.equal(validation.valid, false);
  assert.match(validation.error, /activities/);
});

test("validateBackupSchema rejects backups with invalid settings structure", () => {
  const incorrect = {
    activities: [],
    settings: "should-be-an-object"
  };
  const validation = validateBackupSchema(incorrect);
  assert.equal(validation.valid, false);
  assert.match(validation.error, /settings/);
});

test("validateBackupSchema rejects backups with invalid settings collections", () => {
  const incorrectRooms = {
    activities: [],
    settings: {
      rooms: "should-be-a-list"
    }
  };
  const validation = validateBackupSchema(incorrectRooms);
  assert.equal(validation.valid, false);
  assert.match(validation.error, /settings.rooms/);
});

test("validateBackupSchema rejects backups with an invalid settings.accounts collection", () => {
  const incorrectAccounts = { activities: [], settings: { accounts: "should-be-a-list" } };
  const validation = validateBackupSchema(incorrectAccounts);
  assert.equal(validation.valid, false);
  assert.match(validation.error, /settings.accounts/);
});

test("validateBackupSchema accepts a null settings sub-collection (treated as absent, not invalid)", () => {
  const backup = { activities: [], settings: { rooms: null, salaries: null, services: null, accounts: null } };
  assert.equal(validateBackupSchema(backup).valid, true);
});

test("validateBackupSchema does not validate the shape of individual activity entries", () => {
  // Known limitation: only checks that `activities` is an array, not that its items are objects.
  const backup = { activities: [null, "not-an-object", 42] };
  assert.equal(validateBackupSchema(backup).valid, true);
});

test("getDaysSinceLastBackup returns null when there is no last_backup_date", () => {
  setAppState({ settings: { last_backup_date: "" } });
  assert.equal(getDaysSinceLastBackup(), null);
});

test("getDaysSinceLastBackup returns null for a malformed date (wrong separator)", () => {
  setAppState({ settings: { last_backup_date: "2025/08/01" } });
  assert.equal(getDaysSinceLastBackup(), null);
});

test("getDaysSinceLastBackup returns 0 for today and a negative count for a future date", () => {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  setAppState({ settings: { last_backup_date: todayStr } });
  assert.equal(getDaysSinceLastBackup(), 0);

  setAppState({ settings: { last_backup_date: "2999-01-01" } });
  assert.ok(getDaysSinceLastBackup() < 0);
});

test("formatLocalDateToFrench formats a valid date and handles missing/malformed input", () => {
  assert.equal(formatLocalDateToFrench("2025-08-01"), "1 août 2025");
  assert.equal(formatLocalDateToFrench(""), "Aucune sauvegarde effectuée");
  assert.equal(formatLocalDateToFrench("2025/08/01"), "2025/08/01"); // wrong separator: returned as-is
});
