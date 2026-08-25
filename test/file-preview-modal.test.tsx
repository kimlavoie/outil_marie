import test from "node:test";
import assert from "node:assert/strict";
import { dom } from "./dom-mock.ts";
import "./indexeddb-mock.ts";

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
import { render, cleanup, fireEvent } from "@testing-library/react";
import { FilePreviewModal } from "../src/components/modals/FilePreviewModal.tsx";
import { openFilePreviewModal } from "../src/activities/file-preview/dispatch.ts";

// Regression test: activities/file-preview/dispatch.ts used to own this modal's DOM wiring
// (close button, backdrop, Escape) from before FilePreviewModal.tsx existed — all dead once it
// did, since those ids (#file-preview-modal, #file-preview-modal-close...) are not rendered by the
// live app. FilePreviewModal.tsx itself had no Escape handler of its own, so pressing Escape while
// the modal was open silently did nothing. Fixed by giving the component its own Escape handler.

function makeTextFile(name: string, content: string): File {
  return new File([content], name, { type: "text/plain" });
}

test.beforeEach(() => {
  document.body.innerHTML = "";
});

test.afterEach(() => cleanup());

test("openFilePreviewModal() opens the modal with the given file's name", async () => {
  render(<FilePreviewModal />);

  await act(async () => {
    await openFilePreviewModal(makeTextFile("notes.txt", "hello"));
  });

  assert.ok(document.querySelector(".modal.active"));
  assert.match(document.querySelector(".modal-title")!.textContent!, /notes\.txt/);
});

test("Escape closes the modal", async () => {
  render(<FilePreviewModal />);

  await act(async () => {
    await openFilePreviewModal(makeTextFile("notes.txt", "hello"));
  });
  assert.ok(document.querySelector(".modal.active"));

  act(() => fireEvent.keyDown(window, { key: "Escape" }));

  assert.equal(document.querySelector(".modal.active"), null);
});

test("Escape does nothing while a PDF/XLSX viewer inside the modal is in fullscreen mode", async () => {
  render(<FilePreviewModal />);

  await act(async () => {
    await openFilePreviewModal(makeTextFile("notes.txt", "hello"));
  });

  const fakeFullscreenViewer = document.createElement("div");
  fakeFullscreenViewer.className = "pdf-custom-viewer pdf-fullscreen-mode";
  document.body.appendChild(fakeFullscreenViewer);

  act(() => fireEvent.keyDown(window, { key: "Escape" }));

  assert.ok(document.querySelector(".modal.active"), "modal should stay open — fullscreen viewer takes priority");
});

test("the close button and backdrop click both close the modal", async () => {
  render(<FilePreviewModal />);

  await act(async () => {
    await openFilePreviewModal(makeTextFile("notes.txt", "hello"));
  });

  act(() => fireEvent.click(document.querySelector('[aria-label="Fermer"]')!));
  assert.equal(document.querySelector(".modal.active"), null);

  await act(async () => {
    await openFilePreviewModal(makeTextFile("notes.txt", "hello"));
  });
  act(() => fireEvent.click(document.querySelector(".modal-backdrop")!));
  assert.equal(document.querySelector(".modal.active"), null);
});

export {};
