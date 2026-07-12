import test from "node:test";
import assert from "node:assert/strict";
import "../indexeddb-mock.ts";
import { dom } from "../dom-mock.ts";

test.after(() => dom.window.close());

import {
  initAutoBackup,
  connectAutoBackupFile,
  disconnectAutoBackup,
  scheduleAutoBackupWrite,
  idbGetAutoBackupHandle
} from "../../src/services/backup/auto-backup.ts";
import { appState, setAppState } from "../../src/state/state.ts";

function setupDom() {
  document.body.innerHTML = `
    <div id="auto-backup-status"></div>
    <div id="auto-backup-reminder-banner" style="display: none"></div>
    <strong id="auto-backup-reminder-filename"></strong>
    <div id="toast-container"></div>
  `;
}

function makeFakeHandle(name: string, opts: { permission?: string; writeShouldFail?: boolean } = {}) {
  const permission = opts.permission ?? "granted";
  const writes: string[] = [];
  return {
    name,
    kind: "file",
    async queryPermission() {
      return permission;
    },
    async requestPermission() {
      return permission;
    },
    async createWritable() {
      return {
        async write(data: string) {
          if (opts.writeShouldFail) throw new Error("disque plein");
          writes.push(data);
        },
        async close() {}
      };
    },
    writes
  };
}

function flush(ms = 50): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function freshState(marker: string) {
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
    activities: [],
    favorites: [],
    selected_year: marker,
    selected_quarters: [1, 2, 3, 4]
  };
}

test("initAutoBackup renders the 'unsupported' status when the File System Access API isn't available", async () => {
  setupDom();
  delete (window as any).showSaveFilePicker;

  await initAutoBackup();

  assert.match(document.getElementById("auto-backup-status")!.textContent!, /Non disponible sur ce navigateur/);
});

test("connectAutoBackupFile persists the handle, writes the current appState, and shows 'Actif'", async () => {
  setupDom();
  setAppState(freshState("MARKER-CONNECT"));
  const handle = makeFakeHandle("compta_marie_autosave.json");
  (window as any).showSaveFilePicker = async () => handle;

  await connectAutoBackupFile();
  await flush();

  const stored = await idbGetAutoBackupHandle();
  assert.ok(stored);
  assert.equal(stored.name, "compta_marie_autosave.json");

  assert.equal(handle.writes.length, 1);
  const written = JSON.parse(handle.writes[0]);
  assert.equal(written.selected_year, "MARKER-CONNECT");

  const status = document.getElementById("auto-backup-status")!;
  assert.match(status.textContent!, /Actif/);
  assert.match(status.textContent!, /compta_marie_autosave\.json/);
});

test("a failed auto-backup write shows 'Échec d'écriture' and a toast instead of silently keeping the last-good badge", async () => {
  setupDom();
  setAppState(freshState("MARKER-FAIL"));
  const failingHandle = makeFakeHandle("backup-en-echec.json", { writeShouldFail: true });
  (window as any).showSaveFilePicker = async () => failingHandle;

  await connectAutoBackupFile();
  await flush();

  const status = document.getElementById("auto-backup-status")!;
  assert.match(status.textContent!, /Échec d'écriture/);
  assert.match(status.textContent!, /la dernière écriture a échoué/);

  const toast = document.querySelector("#toast-container .toast-message");
  assert.ok(toast);
  assert.match(toast!.textContent!, /Échec de l'écriture de la sauvegarde automatique/);
});

test("scheduleAutoBackupWrite debounces, and a beforeunload flushes the pending write immediately instead of waiting out the 1500ms delay", async () => {
  setupDom();
  setAppState(freshState("MARKER-DEBOUNCE"));
  const handle = makeFakeHandle("debounce.json");
  (window as any).showSaveFilePicker = async () => handle;
  await connectAutoBackupFile(); // sets the module's current handle + writes once on connect
  await flush();
  assert.equal(handle.writes.length, 1);

  scheduleAutoBackupWrite();
  // Well before the 1500ms debounce would fire on its own.
  await flush(30);
  assert.equal(handle.writes.length, 1, "the debounced write must not have fired yet");

  window.dispatchEvent(new Event("beforeunload"));
  await flush(50);

  assert.equal(handle.writes.length, 2, "beforeunload must flush the pending write immediately");
});

test("disconnectAutoBackup clears the stored handle and reverts to the 'disconnected' status", async () => {
  setupDom();
  setAppState(freshState("MARKER-DISCONNECT"));
  const handle = makeFakeHandle("to-disconnect.json");
  (window as any).showSaveFilePicker = async () => handle;
  await connectAutoBackupFile();
  await flush();
  assert.ok(await idbGetAutoBackupHandle());

  (globalThis as any).confirm = () => true;
  await disconnectAutoBackup();

  assert.equal(await idbGetAutoBackupHandle(), null);
  assert.ok(document.getElementById("auto-backup-connect-btn"));
});
export {};
