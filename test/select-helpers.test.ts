import test from "node:test";
import assert from "node:assert/strict";
import { dom } from "./dom-mock.ts";

test.after(() => dom.window.close());

import {
  getMultiSelectValues,
  setMultiSelectValues,
  updateMultiSelectLabel,
  initMultiSelectDropdown
} from "../src/utils/select-helpers.ts";

function setupDom() {
  document.body.innerHTML = `
    <button id="salle-btn" data-default-label="Toutes les salles"></button>
    <div id="salle-panel" class="multi-select-panel" hidden>
      <label><input type="checkbox" value="salle-1" /> Salle 1</label>
      <label><input type="checkbox" value="salle-2" checked /> Salle 2</label>
      <label><input type="checkbox" value="salle-3" /> Salle 3</label>
    </div>
  `;
}

test.beforeEach(() => {
  setupDom();
});

test("getMultiSelectValues returns checked checkbox values", () => {
  const values = getMultiSelectValues("salle-panel");
  assert.deepEqual(values, ["salle-2"]);
});

test("setMultiSelectValues updates checked state and updates label", () => {
  setMultiSelectValues("salle-panel", ["salle-1", "salle-3"]);
  
  const values = getMultiSelectValues("salle-panel");
  assert.deepEqual(values, ["salle-1", "salle-3"]);
  
  const btn = document.getElementById("salle-btn")!;
  assert.equal(btn.textContent, "2 salles");
});

test("updateMultiSelectLabel handles 0, 1, or multiple selections correctly", () => {
  const panel = document.getElementById("salle-panel")!;
  const btn = document.getElementById("salle-btn")!;
  
  // 0 selections -> default label
  panel.querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach(cb => cb.checked = false);
  updateMultiSelectLabel("salle-panel");
  assert.equal(btn.textContent, "Toutes les salles");
  
  // 1 selection -> show actual text
  panel.querySelector<HTMLInputElement>("input[value=salle-1]")!.checked = true;
  updateMultiSelectLabel("salle-panel");
  assert.equal(btn.textContent, "Salle 1");
  
  // All selections -> default label
  panel.querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach(cb => cb.checked = true);
  updateMultiSelectLabel("salle-panel");
  assert.equal(btn.textContent, "Toutes les salles");
});

test("initMultiSelectDropdown manages toggle and change listeners", () => {
  let changed = false;
  initMultiSelectDropdown("salle-btn", "salle-panel", () => { changed = true; });
  
  const btn = document.getElementById("salle-btn")!;
  const panel = document.getElementById("salle-panel")!;
  
  // Test click toggle
  assert.ok(panel.hidden);
  btn.click();
  assert.ok(!panel.hidden);
  
  // Test change callback
  const cb = panel.querySelector<HTMLInputElement>("input[value=salle-1]")!;
  cb.checked = true;
  cb.dispatchEvent(new Event("change", { bubbles: true }));
  assert.ok(changed);
  
  // Test document click close
  document.body.click();
  assert.ok(panel.hidden);
});
