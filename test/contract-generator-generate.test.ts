import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import JSZip from "jszip";
import "./indexeddb-mock.ts";
import { dom } from "./dom-mock.ts";

test.after(() => dom.window.close());

import { appState } from "../src/state/state.ts";
import { generateContractXlsx, generateSoumissionXlsx } from "../src/services/contract-generator.ts";

const now = new Date();
const yyyy = now.getFullYear();
const mm = String(now.getMonth() + 1).padStart(2, "0");
const dd = String(now.getDate()).padStart(2, "0");
const dateStr = `${yyyy}_${mm}_${dd}`;

// generateXlsx() fetches the CONTRAT.xlsx template at runtime (via `fetch`, as a browser would);
// stub it with the real template file from /public so the zip-assembly code under test runs
// against real, valid OOXML parts instead of a hand-rolled fake.
const templatePath = fileURLToPath(new URL("../public/CONTRAT.xlsx", import.meta.url));
const templateBytes = readFileSync(templatePath);

function stubFetchOk() {
  (globalThis as any).fetch = async () => ({
    ok: true,
    status: 200,
    arrayBuffer: async () => templateBytes.buffer.slice(templateBytes.byteOffset, templateBytes.byteOffset + templateBytes.byteLength)
  });
}

appState.settings = {
  theme: "dark",
  rooms: [],
  departments: [],
  accounts: [],
  last_backup_date: "",
  backup_reminder_days: 7,
  salaries: [],
  services: [],
  global_tasks: [],
  schedulable_tasks: []
} as any;

function makeActivity(overrides: any = {}) {
  return {
    id: "act-1",
    name: "Activité de test",
    description: "",
    attendees_count: 0,
    activity_manager: {},
    responsable_first_name: "",
    responsable_last_name: "",
    reservations: [],
    ...overrides
  };
}

test.beforeEach(() => {
  document.body.innerHTML = `<div id="toast-container"></div>`;
});

test("generateContractXlsx produces a valid, non-empty .xlsx with the header drawing embedded", async () => {
  stubFetchOk();
  const result = await generateContractXlsx(makeActivity());

  assert.ok(result);
  assert.ok(result!.blob.size > 0);
  // Filenames are sanitized to lowercase [a-z0-9_] only: accents are stripped, not replaced.
  assert.equal(result!.filename, `contrat_${dateStr}_activite_de_test.xlsx`);

  const buffer = Buffer.from(await result!.blob.arrayBuffer());
  // A zip/xlsx file always starts with the "PK" local-file-header signature.
  assert.equal(buffer[0], 0x50);
  assert.equal(buffer[1], 0x4b);

  const zip = await JSZip.loadAsync(buffer);
  assert.ok(zip.file("[Content_Types].xml"));
  assert.ok(zip.file("xl/workbook.xml"));
  assert.ok(zip.file("xl/worksheets/sheet1.xml"));
  assert.ok(zip.file("xl/styles.xml"));
  assert.ok(zip.file("xl/drawings/drawing1.xml"), "the 'contrat' variant must embed the header image/drawing");
  assert.ok(zip.file("xl/media/image2.png"));

  const workbookXml = await zip.file("xl/workbook.xml")!.async("text");
  assert.match(workbookXml, /<sheet name="Contrat"/);
});

test("generateSoumissionXlsx produces a valid .xlsx without the header drawing", async () => {
  stubFetchOk();
  const result = await generateSoumissionXlsx(makeActivity({ id: "act-2", name: "Autre Activité" }));

  assert.ok(result);
  assert.equal(result!.filename, `soumission_${dateStr}_autre_activite.xlsx`);

  const buffer = Buffer.from(await result!.blob.arrayBuffer());
  const zip = await JSZip.loadAsync(buffer);
  assert.ok(zip.file("xl/worksheets/sheet1.xml"));
  assert.equal(zip.file("xl/drawings/drawing1.xml"), null, "the 'soumission' variant must not embed the header image/drawing");
  assert.equal(zip.file("xl/media/image2.png"), null);

  const workbookXml = await zip.file("xl/workbook.xml")!.async("text");
  assert.match(workbookXml, /<sheet name="Soumission"/);
});

test("generateContractXlsx falls back to 'activite' in the filename when the activity has no name", async () => {
  stubFetchOk();
  const result = await generateContractXlsx(makeActivity({ id: "act-3", name: "" }));
  assert.equal(result!.filename, `contrat_${dateStr}_activite.xlsx`);
});

test("generateContractXlsx shows an error toast and returns nothing when the template can't be fetched", async () => {
  (globalThis as any).fetch = async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) });

  const result = await generateContractXlsx(makeActivity());

  assert.equal(result, undefined);
  const toast = document.querySelector("#toast-container .toast-message");
  assert.ok(toast);
  assert.match(toast!.textContent!, /Impossible de charger le gabarit/);
});

test("generateContractXlsx shows an error toast when the template is missing required parts (styles/image)", async () => {
  const emptyZip = new JSZip();
  const emptyBuffer = await emptyZip.generateAsync({ type: "nodebuffer" });
  (globalThis as any).fetch = async () => ({
    ok: true,
    status: 200,
    arrayBuffer: async () => emptyBuffer.buffer.slice(emptyBuffer.byteOffset, emptyBuffer.byteOffset + emptyBuffer.byteLength)
  });

  const result = await generateContractXlsx(makeActivity());

  assert.equal(result, undefined);
  const toast = document.querySelector("#toast-container .toast-message");
  assert.ok(toast);
  assert.match(toast!.textContent!, /gabarit de contrat est invalide/);
});

test("generateSoumissionXlsx uses the activity's date_start when present", async () => {
  stubFetchOk();
  const result = await generateSoumissionXlsx(makeActivity({ id: "act-4", name: "Activité avec date", date_start: "2026-08-15" }));
  assert.ok(result);
  assert.equal(result!.filename, "soumission_2026_08_15_activite_avec_date.xlsx");
});

export {};
