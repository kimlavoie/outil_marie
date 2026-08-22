import test from "node:test";
import assert from "node:assert/strict";
import "../indexeddb-mock.ts";
import {
  validateBackupSchema,
  getDaysSinceLastBackup,
  formatLocalDateToFrench,
  checkBackupReminder,
  openAutoBackupDb,
  idbGetAutoBackupHandle,
  idbSetAutoBackupHandle,
  idbClearAutoBackupHandle
} from "../../src/services/backup/index.ts";
import { appState, setAppState } from "../../src/state/state.ts";

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
  assert.ok(validation.error);
  assert.match(validation.error!, /activities/);
});

test("validateBackupSchema rejects backups with invalid settings structure", () => {
  const incorrect = {
    activities: [],
    settings: "should-be-an-object"
  };
  const validation = validateBackupSchema(incorrect);
  assert.equal(validation.valid, false);
  assert.ok(validation.error);
  assert.match(validation.error!, /settings/);
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
  assert.ok(validation.error);
  assert.match(validation.error!, /settings.rooms/);
});

test("validateBackupSchema rejects backups with an invalid settings.accounts collection", () => {
  const incorrectAccounts = { activities: [], settings: { accounts: "should-be-a-list" } };
  const validation = validateBackupSchema(incorrectAccounts);
  assert.equal(validation.valid, false);
  assert.ok(validation.error);
  assert.match(validation.error!, /settings.accounts/);
});

test("validateBackupSchema accepts a null settings sub-collection (treated as absent, not invalid)", () => {
  const backup = { activities: [], settings: { rooms: null, salaries: null, services: null, accounts: null } };
  assert.equal(validateBackupSchema(backup).valid, true);
});

test("validateBackupSchema rejects activity entries that aren't objects with a non-empty id", () => {
  assert.equal(validateBackupSchema({ activities: [null, "not-an-object", 42] }).valid, false);
  assert.equal(validateBackupSchema({ activities: [{ name: "Sans id" }] }).valid, false);
  assert.equal(validateBackupSchema({ activities: [{ id: "" }] }).valid, false);
  assert.equal(validateBackupSchema({ activities: [{ id: "act-1" }] }).valid, true);
});

test("validateBackupSchema rejects duplicate activity ids", () => {
  const backup = { activities: [{ id: "act-1" }, { id: "act-1" }] };
  const validation = validateBackupSchema(backup);
  assert.equal(validation.valid, false);
  assert.match(validation.error!, /double/);
});

test("validateBackupSchema validates the shape of settings sub-collection items", () => {
  assert.equal(validateBackupSchema({ activities: [], settings: { rooms: [{ color: "#fff" }] } }).valid, false);
  assert.equal(validateBackupSchema({ activities: [], settings: { rooms: [{ name: "Salle A" }] } }).valid, true);

  assert.equal(validateBackupSchema({ activities: [], settings: { salaries: [{ job: "Hôte" }] } }).valid, false);
  assert.equal(validateBackupSchema({ activities: [], settings: { salaries: [{ id: "salary-1", job: "Hôte" }] } }).valid, true);

  assert.equal(validateBackupSchema({ activities: [], settings: { services: [{ name: "Projecteur" }] } }).valid, false);
  assert.equal(validateBackupSchema({ activities: [], settings: { services: [{ id: "service-1", name: "Projecteur" }] } }).valid, true);

  assert.equal(validateBackupSchema({ activities: [], settings: { accounts: [{ description: "SCOLAIRE" }] } }).valid, false);
  assert.equal(validateBackupSchema({ activities: [], settings: { accounts: [{ code: "892-0000-00-000" }] } }).valid, true);

  assert.equal(validateBackupSchema({ activities: [], settings: { departments: [42] } }).valid, false);
  assert.equal(validateBackupSchema({ activities: [], settings: { departments: ["ACEECJ"] } }).valid, true);

  assert.equal(validateBackupSchema({ activities: [], settings: { global_tasks: [{ description: "Sans id" }] } }).valid, false);
  assert.equal(validateBackupSchema({ activities: [], settings: { global_tasks: [{ id: "t1", description: "Ok" }] } }).valid, true);

  assert.equal(validateBackupSchema({ activities: [], settings: { schedulable_tasks: [{ description: "Sans id" }] } }).valid, false);
  assert.equal(validateBackupSchema({ activities: [], settings: { schedulable_tasks: [{ id: "t1" }] } }).valid, true);
});

test("validateBackupSchema validates the deep shape of an activity's reservations", () => {
  const validReservation = {
    id: "act-1",
    reservations: [
      {
        room_name: "Salle A",
        tariff_amount: 100,
        slots: [{ date: "2025-08-01", start_time: "09:00", end_time: "17:00" }],
        fees: [{ description: "Frais additionnels", amount: 25 }],
        staff: [],
        services: []
      }
    ]
  };
  assert.equal(validateBackupSchema({ activities: [validReservation] }).valid, true);

  assert.equal(
    validateBackupSchema({ activities: [{ id: "act-1", reservations: "not-a-list" }] }).valid,
    false
  );
  assert.equal(
    validateBackupSchema({ activities: [{ id: "act-1", reservations: [{ room_name: 42 }] }] }).valid,
    false
  );
  assert.equal(
    validateBackupSchema({ activities: [{ id: "act-1", reservations: [{ tariff_amount: "100" }] }] }).valid,
    false
  );
  assert.equal(
    validateBackupSchema({
      activities: [{ id: "act-1", reservations: [{ slots: [{ date: "2025-08-01", start_time: "09:00", end_time: null }] }] }]
    }).valid,
    false
  );
  assert.equal(
    validateBackupSchema({
      activities: [{ id: "act-1", reservations: [{ fees: [{ description: "Frais", amount: "25" }] }] }]
    }).valid,
    false
  );
});

test("validateBackupSchema validates the deep shape of an activity's distributions", () => {
  assert.equal(
    validateBackupSchema({
      activities: [{ id: "act-1", distributions: [{ account_code: "892-0000-00-000", amount: 100 }] }]
    }).valid,
    true
  );
  assert.equal(
    validateBackupSchema({ activities: [{ id: "act-1", distributions: [{ account_code: "", amount: 100 }] }] }).valid,
    false
  );
  assert.equal(
    validateBackupSchema({
      activities: [{ id: "act-1", distributions: [{ account_code: "892-0000-00-000", amount: "100" }] }]
    }).valid,
    false
  );
});

test("validateBackupSchema rejects activities with wrong-typed top-level fields", () => {
  assert.equal(validateBackupSchema({ activities: [{ id: "act-1", name: 42 }] }).valid, false);
  assert.equal(validateBackupSchema({ activities: [{ id: "act-1", date_start: 20250801 }] }).valid, false);
  assert.equal(validateBackupSchema({ activities: [{ id: "act-1", attendees_count: "beaucoup" }] }).valid, false);
});

test("getDaysSinceLastBackup returns null when there is no last_backup_date", () => {
  setAppState({
    settings: {
      theme: "dark",
      rooms: [],
      departments: [],
      accounts: [],
      last_backup_date: "",
      backup_reminder_days: 7,
      salaries: [],
      services: [],
      global_tasks: [],
      schedulable_tasks: [],
      tax_rates: { tps: 0.05, tvq: 0.09975 }
    },
    activities: [],
    favorites: [],
    selected_year: "",
    selected_quarters: [1, 2, 3, 4]
  });
  assert.equal(getDaysSinceLastBackup(), null);
});

test("getDaysSinceLastBackup returns null for a malformed date (wrong separator)", () => {
  setAppState({
    settings: {
      theme: "dark",
      rooms: [],
      departments: [],
      accounts: [],
      last_backup_date: "2025/08/01",
      backup_reminder_days: 7,
      salaries: [],
      services: [],
      global_tasks: [],
      schedulable_tasks: [],
      tax_rates: { tps: 0.05, tvq: 0.09975 }
    },
    activities: [],
    favorites: [],
    selected_year: "",
    selected_quarters: [1, 2, 3, 4]
  });
  assert.equal(getDaysSinceLastBackup(), null);
});

test("getDaysSinceLastBackup returns 0 for today and a negative count for a future date", () => {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  setAppState({
    settings: {
      theme: "dark",
      rooms: [],
      departments: [],
      accounts: [],
      last_backup_date: todayStr,
      backup_reminder_days: 7,
      salaries: [],
      services: [],
      global_tasks: [],
      schedulable_tasks: [],
      tax_rates: { tps: 0.05, tvq: 0.09975 }
    },
    activities: [],
    favorites: [],
    selected_year: "",
    selected_quarters: [1, 2, 3, 4]
  });
  assert.equal(getDaysSinceLastBackup(), 0);

  setAppState({
    settings: {
      theme: "dark",
      rooms: [],
      departments: [],
      accounts: [],
      last_backup_date: "2999-01-01",
      backup_reminder_days: 7,
      salaries: [],
      services: [],
      global_tasks: [],
      schedulable_tasks: [],
      tax_rates: { tps: 0.05, tvq: 0.09975 }
    },
    activities: [],
    favorites: [],
    selected_year: "",
    selected_quarters: [1, 2, 3, 4]
  });
  const diff = getDaysSinceLastBackup();
  assert.ok(diff !== null && diff < 0);
});

test("formatLocalDateToFrench formats a valid date and handles missing/malformed input", () => {
  assert.equal(formatLocalDateToFrench("2025-08-01"), "1 août 2025");
  assert.equal(formatLocalDateToFrench(""), "Aucune sauvegarde effectuée");
  assert.equal(formatLocalDateToFrench("2025/08/01"), "2025/08/01"); // wrong separator: returned as-is
});

test("checkBackupReminder hides banner if no activities exist", () => {
  const banner = { style: { display: "block" } };
  const alertText = { innerHTML: "" };
  (globalThis as any).document = {
    getElementById(id: string) {
      if (id === "backup-reminder-banner") return banner;
      if (id === "backup-alert-text") return alertText;
      return null;
    }
  };
  
  setAppState({
    settings: {
      theme: "dark",
      rooms: [],
      departments: [],
      accounts: [],
      last_backup_date: "",
      backup_reminder_days: 7,
      salaries: [],
      services: [],
      global_tasks: [],
      schedulable_tasks: [],
      tax_rates: { tps: 0.05, tvq: 0.09975 }
    },
    activities: [],
    favorites: [],
    selected_year: "",
    selected_quarters: [1, 2, 3, 4]
  });
  checkBackupReminder();
  assert.equal(banner.style.display, "none");
});

test("checkBackupReminder shows banner if activities exist but no backup date", () => {
  const banner = { style: { display: "none" } };
  const alertText = { innerHTML: "" };
  (globalThis as any).document = {
    getElementById(id: string) {
      if (id === "backup-reminder-banner") return banner;
      if (id === "backup-alert-text") return alertText;
      return null;
    }
  };
  
  setAppState({
    settings: {
      theme: "dark",
      rooms: [],
      departments: [],
      accounts: [],
      last_backup_date: "",
      backup_reminder_days: 7,
      salaries: [],
      services: [],
      global_tasks: [],
      schedulable_tasks: [],
      tax_rates: { tps: 0.05, tvq: 0.09975 }
    },
    activities: [{ id: "act-1" }] as any,
    favorites: [],
    selected_year: "",
    selected_quarters: [1, 2, 3, 4]
  });
  checkBackupReminder();
  assert.equal(banner.style.display, "flex");
  assert.ok(alertText.innerHTML.includes("Aucune sauvegarde"));
});

export {};
