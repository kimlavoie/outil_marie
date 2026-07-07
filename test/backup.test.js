import test from "node:test";
import assert from "node:assert/strict";
import { validateBackupSchema } from "../js/backup.js";

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
