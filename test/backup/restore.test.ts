import test from "node:test";
import assert from "node:assert/strict";
import "../indexeddb-mock.ts";
import { dom } from "../dom-mock.ts";

test.after(() => dom.window.close());

// happy-dom's window (set on globalThis by dom-mock.ts) provides File/FileReader; restore.ts
// references them as bare globals (like a browser would), so mirror that onto globalThis here.
(globalThis as any).FileReader = (globalThis as any).window.FileReader;
(globalThis as any).File = (globalThis as any).window.File;

import { handleJsonBackupFile } from "../../src/services/backup/restore.ts";
import { appState, setAppState, getAppStateFromDb } from "../../src/state/state.ts";

function baseSettings(overrides: any = {}) {
  return {
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
    ...overrides
  };
}

function makeFile(content: any): File {
  const text = typeof content === "string" ? content : JSON.stringify(content);
  return new (globalThis as any).File([text], "backup.json", { type: "application/json" });
}

function flush(ms = 250): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

test.beforeEach(() => {
  document.body.innerHTML = `<div id="toast-container"></div>`;
});

test("handleJsonBackupFile rejects a malformed backup and leaves appState untouched", async () => {
  const original = { settings: baseSettings(), activities: [], favorites: [], selected_year: "MARKER-INVALID", selected_quarters: [1, 2, 3, 4] };
  setAppState(JSON.parse(JSON.stringify(original)));
  (globalThis as any).confirm = () => true;

  handleJsonBackupFile(makeFile({ activities: "not-an-array" }));
  await flush();

  assert.equal(appState.selected_year, "MARKER-INVALID");
  assert.equal(appState.activities.length, 0);
  const toast = document.querySelector("#toast-container .toast-message");
  assert.ok(toast);
  assert.match(toast!.textContent!, /Échec de la validation/);
});

test("handleJsonBackupFile does nothing when the user cancels the confirmation", async () => {
  const original = { settings: baseSettings(), activities: [], favorites: [], selected_year: "MARKER-CANCEL", selected_quarters: [1, 2, 3, 4] };
  setAppState(JSON.parse(JSON.stringify(original)));
  (globalThis as any).confirm = () => false;

  handleJsonBackupFile(makeFile({ activities: [{ id: "act-1", name: "Test" }] }));
  await flush();

  assert.equal(appState.selected_year, "MARKER-CANCEL");
  assert.equal(appState.activities.length, 0);
});

test("handleJsonBackupFile sanitizes restored activities missing a name (regression: name-less activity used to crash later reconciliation)", async () => {
  setAppState({ settings: baseSettings(), activities: [], favorites: [], selected_year: "PRE", selected_quarters: [1, 2, 3, 4] });
  (globalThis as any).confirm = () => true;

  // validateBackupSchema explicitly allows an activity with no `name` field.
  handleJsonBackupFile(makeFile({ activities: [{ id: "act-1" }], settings: baseSettings() }));
  await flush();

  assert.equal(appState.activities.length, 1);
  assert.equal(appState.activities[0].id, "act-1");
  assert.equal(typeof appState.activities[0].name, "string");
  assert.equal(appState.activities[0].name, "");
});

test("handleJsonBackupFile rolls back AND re-persists the pre-restore state when migration throws", async () => {
  const preRestore = {
    settings: baseSettings(),
    activities: [{ id: "act-pre", name: "Activité pré-existante" }],
    favorites: [],
    selected_year: "PRE-MARKER",
    selected_quarters: [1, 2, 3, 4]
  };
  setAppState(JSON.parse(JSON.stringify(preRestore)));
  (globalThis as any).confirm = () => true;

  // A salary with a non-array rate_versions passes schema validation (only id/shape are checked)
  // but makes migrateSalariesConfig's `sal.rate_versions.forEach(...)` throw, forcing the
  // migration-failure/rollback path.
  handleJsonBackupFile(
    makeFile({
      activities: [{ id: "act-new", name: "Ne devrait pas survivre" }],
      settings: baseSettings({ salaries: [{ id: "sal-1", rate_versions: "boom" }] })
    })
  );
  await flush(800);

  assert.equal(appState.selected_year, "PRE-MARKER");
  assert.equal(appState.activities.length, 1);
  assert.equal(appState.activities[0].id, "act-pre");

  // The rollback must also be re-persisted to disk, not just held in memory.
  const persisted = await getAppStateFromDb();
  assert.ok(persisted);
  assert.equal(persisted.selected_year, "PRE-MARKER");
  assert.equal(persisted.activities.length, 1);
  assert.equal(persisted.activities[0].id, "act-pre");

  const toast = document.querySelector("#toast-container .toast-message");
  assert.ok(toast);
  assert.match(toast!.textContent!, /a échoué/);
});
export {};
