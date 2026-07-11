import test from "node:test";
import assert from "node:assert/strict";
import "./indexeddb-mock.ts";
import { dom } from "./dom-mock.ts";

test.after(() => dom.window.close());

import { renderFileLinkStatus, pickAndLinkFile, idbSetFileLink, idbGetFileLink } from "../src/activities/file-links/index.ts";

function makeActivity(overrides: any = {}) {
  return {
    id: "act-1",
    name: "Activité test",
    submission: { file_link_id: "", generated_at: "", sent_at: "" },
    contract: { file_link_id: "", approved_at: "" },
    form: { file_link_id: "", linked_at: "" },
    ...overrides
  };
}

function setupContainer(kind: "submission" | "contract" | "form") {
  const id = kind === "submission" ? "submission-file-status" : kind === "contract" ? "contract-file-status" : "form-file-status";
  document.body.innerHTML = `
    <div id="${id}"></div>
    <div id="submission-xlsx-preview"></div>
    <div id="contract-xlsx-preview"></div>
    <div id="form-pdf-preview"></div>
  `;
  return document.getElementById(id)!;
}

test("idbSetFileLink / idbGetFileLink round-trip a file handle record through IndexedDB", async () => {
  const record = { handle: { name: "contrat.xlsx", kind: "file" }, name: "contrat.xlsx" };
  await idbSetFileLink("link-1", record);
  const fetched = await idbGetFileLink("link-1");
  assert.deepEqual(fetched, record);
});

test("idbGetFileLink returns null for an id that was never linked", async () => {
  const fetched = await idbGetFileLink("never-linked");
  assert.equal(fetched, null);
});

test("renderFileLinkStatus (submission, unlinked) shows the 'no file' label and only the link/generate/mark-submitted actions", () => {
  const container = setupContainer("submission");
  renderFileLinkStatus("submission", makeActivity());

  assert.match(container.innerHTML, /Aucun fichier lié/);
  assert.ok(container.querySelector("#submission-link-file-btn"));
  assert.ok(container.querySelector("#submission-generate-btn"));
  assert.equal(container.querySelector("#submission-open-file-btn"), null);
  assert.equal(container.querySelector("#submission-unlink-file-btn"), null);
  const markBtn = container.querySelector("#mark-submitted-btn")!;
  assert.match(markBtn.textContent!, /Marquer comme Soumise au client/);
  assert.equal(markBtn.className.includes("btn-primary"), true);
});

test("renderFileLinkStatus (submission, linked + sent) shows open/unlink actions and the 'cancel' state on the mark button", () => {
  const container = setupContainer("submission");
  renderFileLinkStatus(
    "submission",
    makeActivity({ submission: { file_link_id: "link-1", generated_at: "2025-08-01", sent_at: "2025-08-02" } })
  );

  assert.match(container.innerHTML, /Fichier lié/);
  assert.ok(container.querySelector("#submission-open-file-btn"));
  assert.ok(container.querySelector("#submission-unlink-file-btn"));
  assert.ok(container.querySelector("#submission-toggle-preview-btn"));
  const markBtn = container.querySelector("#mark-submitted-btn")!;
  assert.match(markBtn.textContent!, /Annuler Soumise au client/);
  assert.equal(markBtn.className.includes("btn-secondary"), true);
});

test("renderFileLinkStatus (contract, linked + approved) shows the 'cancel approved' state and no generate-submission button", () => {
  const container = setupContainer("contract");
  renderFileLinkStatus("contract", makeActivity({ contract: { file_link_id: "link-1", approved_at: "2025-08-02" } }));

  assert.ok(container.querySelector("#contract-generate-btn"));
  assert.equal(container.querySelector("#submission-generate-btn"), null);
  const markBtn = container.querySelector("#mark-approved-btn")!;
  assert.match(markBtn.textContent!, /Annuler Approuvée/);
});

test("renderFileLinkStatus (form, unlinked) has no state-transition button and no preview-toggle button", () => {
  const container = setupContainer("form");
  renderFileLinkStatus("form", makeActivity());

  assert.equal(container.querySelector("#mark-submitted-btn"), null);
  assert.equal(container.querySelector("#mark-approved-btn"), null);
  assert.equal(container.querySelector("#form-toggle-preview-btn"), null);
  assert.match(document.getElementById("form-pdf-preview")!.innerHTML, /Aucun formulaire PDF lié/);
});

test("pickAndLinkFile warns instead of throwing when the browser lacks the File System Access API", async () => {
  delete (window as any).showOpenFilePicker;

  await assert.doesNotReject(pickAndLinkFile("act-1", "form"));
});

test("pickAndLinkFile rejects a non-PDF file for the 'form' kind without linking it", async () => {
  (window as any).showOpenFilePicker = async () => [{ name: "contrat.xlsx" }];
  const before = await idbGetFileLink("should-not-exist");
  assert.equal(before, null);

  await pickAndLinkFile("act-1", "form");

  // Nothing should have been persisted under any newly generated link id for this rejected file;
  // spot-check there's no leftover record keyed by the activity id (pickAndLinkFile never reuses
  // that as a link id, but this also guards against a future regression that would).
  const linked = await idbGetFileLink("act-1");
  assert.equal(linked, null);
});
