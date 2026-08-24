import test from "node:test";
import assert from "node:assert/strict";
import { dom } from "../dom-mock.ts";
import "../indexeddb-mock.ts";

test.after(() => dom.window.close());

(globalThis as any).localStorage = {
  store: {} as Record<string, string>,
  getItem(key: string) { return this.store[key] || null; },
  setItem(key: string, value: string) { this.store[key] = String(value); },
  removeItem(key: string) { delete this.store[key]; },
  clear() { this.store = {}; }
};
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { act } from "react";
import { render, cleanup } from "@testing-library/react";
import { setAppState, appState, notifyAppStateChange } from "../../src/state/state.ts";
import { getSafetyBackupsFromDb } from "../../src/state/db.ts";
import { BackupView } from "../../src/components/backup/BackupView.tsx";

// Regression coverage for two real bugs found while converting this view's last DOM-owned pieces
// (status date/badge) to React:
// 1. handleResetDatabase() didn't save a safety backup before wiping the database, unlike the
//    (effectively dead — see services/backup/index.ts's header comment) legacy reset handler and
//    the "Zone de Danger" card's own promise ("l'application conserve une copie automatique des
//    données précédentes" before a reset).
// 2. The status badge/date were dual-owned: React rendered them once, then
//    services/backup/reminder.ts's renderBackupView() overwrote them imperatively on mount and
//    after auto-backups — but any later React re-render (e.g. right after a JSON export bumps
//    last_backup_date) silently reverted them, since nothing re-ran renderBackupView() afterward.

function baseState(overrides: any = {}) {
  return {
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
    activities: [{ id: "act-1", name: "Activité test", deleted: false }] as any,
    favorites: [],
    selected_year: "2025-2026",
    selected_quarters: [1, 2, 3, 4],
    ...overrides
  };
}

test.beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

test.afterEach(() => cleanup());

test("status badge shows 'Non sauvegardé' with no backup yet, and 'À jour' right after one", async () => {
  setAppState(baseState({ settings: { ...baseState().settings, last_backup_date: "" } }));
  const { container } = render(<BackupView />);
  await act(async () => {});

  assert.match(container.textContent!, /Non sauvegardé/);

  const today = new Date().toISOString().split("T")[0];
  act(() => {
    appState.settings.last_backup_date = today;
    notifyAppStateChange();
  });
  await act(async () => {});

  assert.match(container.textContent!, /À jour/);
  assert.doesNotMatch(container.textContent!, /Non sauvegardé/);
});

test("status badge shows 'Sauvegarde requise' once the last backup is older than the reminder threshold", async () => {
  const old = new Date();
  old.setDate(old.getDate() - 10);
  const oldStr = `${old.getFullYear()}-${String(old.getMonth() + 1).padStart(2, "0")}-${String(old.getDate()).padStart(2, "0")}`;

  setAppState(baseState({ settings: { ...baseState().settings, last_backup_date: oldStr, backup_reminder_days: 7 } }));
  const { container } = render(<BackupView />);
  await act(async () => {});

  assert.match(container.textContent!, /Sauvegarde requise/);
});

test("resetting the database saves a safety backup first", async () => {
  setAppState(baseState());
  const originalConfirm = window.confirm;
  const originalReload = window.location.reload;
  (window as any).confirm = () => true;
  (window as any).location = { ...window.location, reload: () => {} };

  const { getByText } = render(<BackupView />);
  await act(async () => {});

  const before = await getSafetyBackupsFromDb();
  assert.equal(before.length, 0);

  await act(async () => {
    getByText(/Réinitialiser la base de données/).click();
    await new Promise(r => setTimeout(r, 50));
  });

  const after = await getSafetyBackupsFromDb();
  assert.equal(after.length, 1);
  assert.equal(after[0].label, "avant_reinitialisation");

  window.confirm = originalConfirm;
  (window as any).location.reload = originalReload;
});

export {};
