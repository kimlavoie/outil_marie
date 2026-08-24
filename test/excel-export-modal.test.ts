import test from "node:test";
import assert from "node:assert/strict";

import { savePreset, loadPresets, deletePreset } from "../src/services/excel-export-modal.ts";
import { getDefaultExportOptions } from "../src/services/excel-export.ts";

(globalThis as any).localStorage = {
  store: new Map<string, string>(),
  getItem(key: string) { return this.store.get(key) || null; },
  setItem(key: string, val: string) { this.store.set(key, val); },
  removeItem(key: string) { this.store.delete(key); },
  clear() { this.store.clear(); }
};

// The modal UI itself moved to components/modals/ExcelExportModal.tsx (React) — see
// test/excel-export-modal-view.test.tsx for its coverage. This file only exercises the
// remaining plain data logic (preset CRUD), which stayed in this module.

test("presets lifecycle: savePreset, loadPresets, and deletePreset", () => {
  (globalThis as any).localStorage.clear();
  const opts = getDefaultExportOptions();
  opts.filters.clientTypes = ["externe"];

  const p1 = savePreset("Rapport Clients Externes", opts);
  assert.ok(p1.id);
  assert.equal(p1.name, "Rapport Clients Externes");

  const p2 = savePreset("Rapport Musique", opts);
  assert.ok(p2.id);

  let list = loadPresets();
  assert.equal(list.length, 2);
  assert.equal(list[0].options.filters.clientTypes[0], "externe");

  deletePreset(p1.id);
  list = loadPresets();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, p2.id);
});
