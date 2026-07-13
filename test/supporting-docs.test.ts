import test from "node:test";
import assert from "node:assert/strict";
import "./indexeddb-mock.ts";
import { dom } from "./dom-mock.ts";

test.after(() => dom.window.close());

import { listFolderEntries, writeFilesToFolder } from "../src/activities/supporting-docs/actions.ts";
import { renderSupportingDocsStatus } from "../src/activities/supporting-docs/status.ts";
import { setAppState } from "../src/state/state.ts";

// --- Mock File System Access API primitives -------------------------------------------------

function makeFile(name: string, content = "x", lastModified = Date.now()): File {
  return new File([content], name, { lastModified });
}

class MockFileHandle {
  kind = "file" as const;
  name: string;
  private file: File;
  private writtenContent: string | null = null;

  constructor(file: File) {
    this.name = file.name;
    this.file = file;
  }

  async getFile(): Promise<File> {
    return this.writtenContent !== null ? new File([this.writtenContent], this.name) : this.file;
  }

  async createWritable() {
    return {
      write: async (data: File) => {
        this.writtenContent = await data.text();
      },
      close: async () => {}
    };
  }
}

class MockDirectoryHandle {
  kind = "directory" as const;
  name: string;
  children: Map<string, MockFileHandle | MockDirectoryHandle>;
  readwriteGranted: boolean;

  constructor(name: string, children: (MockFileHandle | MockDirectoryHandle)[] = [], readwriteGranted = true) {
    this.name = name;
    this.children = new Map(children.map(c => [c.name, c]));
    this.readwriteGranted = readwriteGranted;
  }

  async *values() {
    for (const child of this.children.values()) yield child;
  }

  async queryPermission(opts: { mode: string }) {
    if (opts.mode === "readwrite") return this.readwriteGranted ? "granted" : "prompt";
    return "granted";
  }

  async requestPermission(opts: { mode: string }) {
    if (opts.mode === "readwrite") return this.readwriteGranted ? "granted" : "denied";
    return "granted";
  }

  async getFileHandle(name: string, opts?: { create?: boolean }) {
    let handle = this.children.get(name);
    if (!handle && opts?.create) {
      handle = new MockFileHandle(makeFile(name, ""));
      this.children.set(name, handle);
    }
    if (!handle || handle.kind !== "file") throw new Error(`file not found: ${name}`);
    return handle as MockFileHandle;
  }
}

// --- listFolderEntries: recursive subfolder listing -----------------------------------------

test("listFolderEntries lists files at the root with an empty relativePath", async () => {
  const root = new MockDirectoryHandle("root", [
    new MockFileHandle(makeFile("b.pdf")),
    new MockFileHandle(makeFile("a.pdf"))
  ]);

  const entries = await listFolderEntries(root);
  assert.deepEqual(entries.map(e => e.name), ["a.pdf", "b.pdf"]);
  assert.deepEqual(entries.map(e => e.relativePath), ["", ""]);
});

test("listFolderEntries recurses into sub-folders and tags entries with their relative path", async () => {
  const invoices2026 = new MockDirectoryHandle("2026", [new MockFileHandle(makeFile("janvier.pdf"))]);
  const invoicesFolder = new MockDirectoryHandle("Factures", [invoices2026, new MockFileHandle(makeFile("index.txt"))]);
  const root = new MockDirectoryHandle("root", [invoicesFolder, new MockFileHandle(makeFile("racine.pdf"))]);

  const entries = await listFolderEntries(root);

  const byName = Object.fromEntries(entries.map(e => [e.name, e.relativePath]));
  assert.equal(byName["racine.pdf"], "");
  assert.equal(byName["index.txt"], "Factures");
  assert.equal(byName["janvier.pdf"], "Factures/2026");
  assert.equal(entries.length, 3);
});

test("listFolderEntries sorts by relativePath then name", async () => {
  const sub = new MockDirectoryHandle("sub", [new MockFileHandle(makeFile("z.pdf"))]);
  const root = new MockDirectoryHandle("root", [sub, new MockFileHandle(makeFile("a.pdf"))]);

  const entries = await listFolderEntries(root);
  // root-level "a.pdf" sorts before "sub/z.pdf" (empty relativePath < "sub").
  assert.deepEqual(entries.map(e => `${e.relativePath}/${e.name}`), ["/a.pdf", "sub/z.pdf"]);
});

// --- writeFilesToFolder: drag-and-drop upload ------------------------------------------------

test("writeFilesToFolder writes each dropped file into the folder root and reports how many succeeded", async () => {
  const root = new MockDirectoryHandle("root", []);
  const dropped = [makeFile("recu.pdf", "contenu-recu"), makeFile("photo.png", "contenu-photo")];

  const result = await writeFilesToFolder(root, dropped);

  assert.equal(result.written, 2);
  assert.deepEqual(result.failed, []);
  const entries = await listFolderEntries(root);
  assert.deepEqual(entries.map(e => e.name).sort(), ["photo.png", "recu.pdf"]);
});

test("writeFilesToFolder refuses to write when readwrite permission is denied", async () => {
  const root = new MockDirectoryHandle("root", [], /* readwriteGranted */ false);
  const dropped = [makeFile("recu.pdf")];

  const result = await writeFilesToFolder(root, dropped);

  assert.equal(result.written, 0);
  assert.deepEqual(result.failed, ["recu.pdf"]);
  const entries = await listFolderEntries(root);
  assert.equal(entries.length, 0);
});

// --- renderSupportingDocsStatus: search/sort UI and drop zone --------------------------------

function makeActivity(overrides: any = {}) {
  return {
    id: "act-1",
    supporting_docs: { folder_link_id: "", linked_at: "" },
    ...overrides
  };
}

function setupContainer() {
  document.body.innerHTML = `<div id="supporting-docs-status"></div>`;
  return document.getElementById("supporting-docs-status")!;
}

test.before(() => {
  setAppState({ activities: [], settings: {}, favorites: [] } as any);
});

test("renderSupportingDocsStatus (unlinked) shows the 'link a folder' action only", async () => {
  (window as any).showDirectoryPicker = async () => new MockDirectoryHandle("root");
  const container = setupContainer();

  await renderSupportingDocsStatus(makeActivity());

  assert.match(container.innerHTML, /Aucun dossier lié/);
  assert.ok(container.querySelector("#supporting-docs-link-btn"));
  assert.equal(container.querySelector("#supporting-docs-search"), null);
});

test("renderSupportingDocsStatus (linked) renders the search/sort toolbar, the drop zone, and every listed file", async () => {
  (window as any).showDirectoryPicker = async () => new MockDirectoryHandle("root");
  const container = setupContainer();

  const root = new MockDirectoryHandle("root", [
    new MockFileHandle(makeFile("facture-avril.pdf", "x", new Date("2026-04-01").getTime())),
    new MockFileHandle(makeFile("recu-janvier.pdf", "x", new Date("2026-01-01").getTime()))
  ]);
  const { idbSetSupportingDocsFolder } = await import("../src/activities/supporting-docs/db.ts");
  await idbSetSupportingDocsFolder("link-1", { handle: root, name: "root" });

  const act = makeActivity({ supporting_docs: { folder_link_id: "link-1", linked_at: "2026-01-01" } });
  await renderSupportingDocsStatus(act);

  assert.ok(container.querySelector("#supporting-docs-search"));
  assert.ok(container.querySelector("#supporting-docs-sort"));
  assert.ok(container.querySelector("#supporting-docs-dropzone"));
  const items = container.querySelectorAll(".supporting-docs-list li");
  assert.equal(items.length, 2);
});

test("renderSupportingDocsStatus search box filters the visible list without touching the disk again", async () => {
  (window as any).showDirectoryPicker = async () => new MockDirectoryHandle("root");
  const container = setupContainer();

  const root = new MockDirectoryHandle("root", [
    new MockFileHandle(makeFile("facture-avril.pdf")),
    new MockFileHandle(makeFile("recu-janvier.pdf"))
  ]);
  const { idbSetSupportingDocsFolder } = await import("../src/activities/supporting-docs/db.ts");
  await idbSetSupportingDocsFolder("link-2", { handle: root, name: "root" });

  const act = makeActivity({ supporting_docs: { folder_link_id: "link-2", linked_at: "2026-01-01" } });
  await renderSupportingDocsStatus(act);

  const searchInput = container.querySelector("#supporting-docs-search") as HTMLInputElement;
  searchInput.value = "facture";
  searchInput.dispatchEvent(new (window as any).Event("input", { bubbles: true }));

  const items = container.querySelectorAll(".supporting-docs-list li");
  assert.equal(items.length, 1);
  assert.match(container.querySelector(".supporting-docs-list")!.textContent!, /facture-avril\.pdf/);
});

test("renderSupportingDocsStatus sort select reorders the visible list by date", async () => {
  (window as any).showDirectoryPicker = async () => new MockDirectoryHandle("root");
  const container = setupContainer();

  const root = new MockDirectoryHandle("root", [
    new MockFileHandle(makeFile("recent.pdf", "x", new Date("2026-06-01").getTime())),
    new MockFileHandle(makeFile("ancien.pdf", "x", new Date("2020-01-01").getTime()))
  ]);
  const { idbSetSupportingDocsFolder } = await import("../src/activities/supporting-docs/db.ts");
  await idbSetSupportingDocsFolder("link-3", { handle: root, name: "root" });

  const act = makeActivity({ supporting_docs: { folder_link_id: "link-3", linked_at: "2026-01-01" } });
  await renderSupportingDocsStatus(act);

  const sortSelect = container.querySelector("#supporting-docs-sort") as HTMLSelectElement;
  sortSelect.value = "date-desc";
  sortSelect.dispatchEvent(new (window as any).Event("change", { bubbles: true }));

  const names = Array.from(container.querySelectorAll(".supporting-docs-list li span:first-of-type")).map(el => el.textContent);
  assert.equal(names[0], "recent.pdf");
});

test("dropping files onto the drop zone writes them into the linked folder and refreshes the list", async () => {
  (window as any).showDirectoryPicker = async () => new MockDirectoryHandle("root");
  const container = setupContainer();

  const root = new MockDirectoryHandle("root", [new MockFileHandle(makeFile("existant.pdf"))]);
  const { idbSetSupportingDocsFolder } = await import("../src/activities/supporting-docs/db.ts");
  await idbSetSupportingDocsFolder("link-4", { handle: root, name: "root" });

  const act = makeActivity({ supporting_docs: { folder_link_id: "link-4", linked_at: "2026-01-01" } });
  await renderSupportingDocsStatus(act);

  assert.equal(container.querySelectorAll(".supporting-docs-list li").length, 1);

  const dropzone = document.getElementById("supporting-docs-dropzone")!;
  const dropEvent = new (window as any).Event("drop", { bubbles: true, cancelable: true });
  (dropEvent as any).dataTransfer = { files: [makeFile("nouveau.pdf", "contenu")] };
  dropzone.dispatchEvent(dropEvent);

  // writeFilesToFolder + the subsequent full re-render are both async; give them a tick.
  await new Promise(resolve => setTimeout(resolve, 20));

  const refreshedContainer = document.getElementById("supporting-docs-status")!;
  const items = refreshedContainer.querySelectorAll(".supporting-docs-list li");
  assert.equal(items.length, 2);
  assert.match(refreshedContainer.querySelector(".supporting-docs-list")!.textContent!, /nouveau\.pdf/);
});
