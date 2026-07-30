import test from "node:test";
import assert from "node:assert/strict";

import { appState } from "../src/state/state.ts";
import { openExcelExportModal, closeExcelExportModal } from "../src/services/excel-export-modal.ts";

function setupDomMock() {
  const elements = new Map<string, any>();

  const backdrop = {
    id: "modal-backdrop",
    classList: {
      active: false,
      add(cls: string) { if (cls === "active") this.active = true; },
      remove(cls: string) { if (cls === "active") this.active = false; },
      contains(cls: string) { return cls === "active" ? this.active : false; }
    },
    addEventListener() {}
  };
  elements.set("modal-backdrop", backdrop);

  (globalThis as any).document = {
    getElementById(id: string) {
      return elements.get(id) || null;
    },
    createElement(tag: string) {
      const el = {
        tagName: tag.toUpperCase(),
        id: "",
        className: "",
        attributes: new Map<string, string>(),
        children: [] as any[],
        innerHTML: "",
        style: {} as Record<string, string>,
        classList: {
          classes: new Set<string>(),
          add(cls: string) { this.classes.add(cls); },
          remove(cls: string) { this.classes.delete(cls); },
          contains(cls: string) { return this.classes.has(cls); },
          toggle(cls: string, force?: boolean) {
            if (force === undefined) {
              if (this.classes.has(cls)) this.classes.delete(cls);
              else this.classes.add(cls);
            } else if (force) this.classes.add(cls);
            else this.classes.delete(cls);
          }
        },
        setAttribute(k: string, v: string) { this.attributes.set(k, v); },
        getAttribute(k: string) { return this.attributes.get(k); },
        addEventListener() {},
        querySelectorAll() { return []; },
        querySelector() { return null; }
      };
      return el;
    },
    body: {
      appendChild(child: any) {
        if (child.id) elements.set(child.id, child);
      }
    }
  };

  (globalThis as any).localStorage = {
    store: new Map<string, string>(),
    getItem(key: string) { return this.store.get(key) || null; },
    setItem(key: string, val: string) { this.store.set(key, val); },
    removeItem(key: string) { this.store.delete(key); },
    clear() { this.store.clear(); }
  };
}

test("openExcelExportModal creates and opens modal with live count", () => {
  setupDomMock();
  appState.activities = [
    { id: "act-1", name: "Activité 1", date_start: "2025-08-01", deleted: false },
    { id: "act-2", name: "Activité 2", date_start: "2025-08-02", deleted: false }
  ];
  appState.selected_year = "2025-2026";
  appState.selected_quarters = [1];

  openExcelExportModal();

  const modalEl = document.getElementById("excel-export-modal");
  const backdropEl = document.getElementById("modal-backdrop");

  assert.ok(modalEl);
  assert.equal(modalEl.classList.contains("active"), true);
  assert.equal(backdropEl?.classList.contains("active"), true);

  closeExcelExportModal();
  assert.equal(modalEl.classList.contains("active"), false);
});

test("presets lifecycle: savePreset, loadPresets, and deletePreset", async () => {
  setupDomMock();
  const { savePreset, loadPresets, deletePreset } = await import("../src/services/excel-export-modal.ts");
  const { getDefaultExportOptions } = await import("../src/services/excel-export.ts");

  const opts = getDefaultExportOptions();
  opts.filters.clientTypes = ["externe"];

  // 1. Save Preset 1
  const p1 = savePreset("Rapport Clients Externes", opts);
  assert.ok(p1.id);
  assert.equal(p1.name, "Rapport Clients Externes");

  // 2. Save Preset 2
  const p2 = savePreset("Rapport Musique", opts);
  assert.ok(p2.id);

  let list = loadPresets();
  assert.equal(list.length, 2);
  assert.equal(list[0].options.filters.clientTypes[0], "externe");

  // 3. Delete Preset 1
  deletePreset(p1.id);
  list = loadPresets();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, p2.id);
});


