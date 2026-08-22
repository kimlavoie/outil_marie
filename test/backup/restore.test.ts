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
  const mockConfirm = () => true;
  (globalThis as any).confirm = mockConfirm;
  (globalThis as any).window.confirm = mockConfirm;
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

test("handleJsonBackupFile does nothing when the user cancels the modal", async () => {
  const original = { settings: baseSettings(), activities: [], favorites: [], selected_year: "MARKER-CANCEL", selected_quarters: [1, 2, 3, 4] };
  setAppState(JSON.parse(JSON.stringify(original)));
  (globalThis as any).confirm = () => true;

  handleJsonBackupFile(makeFile({ activities: [{ id: "act-1", name: "Test" }], settings: baseSettings() }));
  await flush();

  const cancelBtn = document.getElementById("restore-options-modal-cancel");
  assert.ok(cancelBtn);
  cancelBtn.click();
  await flush();

  assert.equal(appState.selected_year, "MARKER-CANCEL");
  assert.equal(appState.activities.length, 0);
});

test("handleJsonBackupFile does nothing when the user cancels the final confirmation", async () => {
  const original = { settings: baseSettings(), activities: [], favorites: [], selected_year: "MARKER-CANCEL", selected_quarters: [1, 2, 3, 4] };
  setAppState(JSON.parse(JSON.stringify(original)));
  (globalThis as any).confirm = () => false;

  handleJsonBackupFile(makeFile({ activities: [{ id: "act-1", name: "Test" }], settings: baseSettings() }));
  await flush();

  const submitBtn = document.getElementById("restore-options-modal-submit");
  assert.ok(submitBtn);
  submitBtn.click();
  await flush();

  assert.equal(appState.selected_year, "MARKER-CANCEL");
  assert.equal(appState.activities.length, 0);
});

test("handleJsonBackupFile sanitizes restored activities missing a name", async () => {
  setAppState({ settings: baseSettings(), activities: [], favorites: [], selected_year: "PRE", selected_quarters: [1, 2, 3, 4] });
  (globalThis as any).confirm = () => true;

  handleJsonBackupFile(makeFile({ activities: [{ id: "act-1" }], settings: baseSettings() }));
  await flush();

  const submitBtn = document.getElementById("restore-options-modal-submit");
  assert.ok(submitBtn);
  submitBtn.click();
  await flush(1000);

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

  handleJsonBackupFile(
    makeFile({
      activities: [{ id: "act-new", name: "Ne devrait pas survivre" }],
      settings: baseSettings({ salaries: [{ id: "sal-1", rate_versions: "boom" }] })
    })
  );
  await flush();

  const submitBtn = document.getElementById("restore-options-modal-submit");
  assert.ok(submitBtn);
  submitBtn.click();
  await flush(1000);

  assert.equal(appState.selected_year, "PRE-MARKER");
  assert.equal(appState.activities.length, 1);
  assert.equal(appState.activities[0].id, "act-pre");

  const persisted = await getAppStateFromDb();
  assert.ok(persisted);
  assert.equal(persisted.selected_year, "PRE-MARKER");
  assert.equal(persisted.activities.length, 1);
  assert.equal(persisted.activities[0].id, "act-pre");
});

test("handleJsonBackupFile restores configurations only", async () => {
  setAppState({
    settings: baseSettings({ theme: "light" }),
    activities: [{ id: "act-current", name: "Keep me" }] as any,
    favorites: [],
    selected_year: "PRE",
    selected_quarters: [1, 2, 3, 4]
  });
  (globalThis as any).confirm = () => true;
  handleJsonBackupFile(
    makeFile({
      activities: [{ id: "act-new", name: "Do not import" }],
      settings: baseSettings({ theme: "dark" })
    })
  );
  await flush();

  const configRadio = document.getElementById("restore-mode-config") as HTMLInputElement;
  assert.ok(configRadio);
  configRadio.click();
  configRadio.dispatchEvent(new Event("change", { bubbles: true }));

  const submitBtn = document.getElementById("restore-options-modal-submit");
  assert.ok(submitBtn);
  submitBtn.click();
  await flush(1000);

  assert.equal(appState.settings.theme, "dark");
  assert.equal(appState.activities.length, 1);
  assert.equal(appState.activities[0].id, "act-current");
});

test("handleJsonBackupFile restores activities only", async () => {
  setAppState({
    settings: baseSettings({ theme: "light" }),
    activities: [{ id: "act-current", name: "Keep me" }] as any,
    favorites: [],
    selected_year: "PRE",
    selected_quarters: [1, 2, 3, 4]
  });
  (globalThis as any).confirm = () => true;
  handleJsonBackupFile(
    makeFile({
      activities: [{ id: "act-new", name: "Import me" }],
      settings: baseSettings({ theme: "dark" })
    })
  );
  await flush();

  const actRadio = document.getElementById("restore-mode-activities") as HTMLInputElement;
  assert.ok(actRadio);
  actRadio.click();
  actRadio.dispatchEvent(new Event("change", { bubbles: true }));

  const submitBtn = document.getElementById("restore-options-modal-submit");
  assert.ok(submitBtn);
  submitBtn.click();
  await flush(1000);

  assert.equal(appState.settings.theme, "light");
  assert.equal(appState.activities.length, 1);
  assert.equal(appState.activities[0].id, "act-new");
});

test("handleJsonBackupFile merges specific activities custom restore", async () => {
  setAppState({
    settings: baseSettings({ theme: "light" }),
    activities: [
      { id: "act-current", name: "Keep me" },
      { id: "act-overlap", name: "Old version" }
    ] as any,
    favorites: [],
    selected_year: "PRE",
    selected_quarters: [1, 2, 3, 4]
  });
  (globalThis as any).confirm = () => true;
  handleJsonBackupFile(
    makeFile({
      activities: [
        { id: "act-overlap", name: "New version" },
        { id: "act-new", name: "Imported" },
        { id: "act-ignored", name: "Ignored" }
      ],
      settings: baseSettings({ theme: "dark" })
    })
  );
  await flush();

  const customRadio = document.getElementById("restore-mode-custom") as HTMLInputElement;
  assert.ok(customRadio);
  customRadio.click();
  customRadio.dispatchEvent(new Event("change", { bubbles: true }));

  const specRadio = document.getElementById("restore-act-select") as HTMLInputElement;
  assert.ok(specRadio);
  specRadio.click();
  specRadio.dispatchEvent(new Event("change", { bubbles: true }));

  const configCbs = [
    "restore-cb-rooms",
    "restore-cb-salaries",
    "restore-cb-services",
    "restore-cb-accounts",
    "restore-cb-departments",
    "restore-cb-tasks",
    "restore-cb-taxes",
    "restore-cb-preferences"
  ];
  configCbs.forEach(id => {
    (document.getElementById(id) as HTMLInputElement).checked = false;
  });

  const checklist = document.getElementById("restore-activities-checklist")!;
  const checkboxes = checklist.querySelectorAll(".restore-activity-cb") as NodeListOf<HTMLInputElement>;
  checkboxes.forEach(cb => {
    if (cb.dataset.id === "act-ignored") {
      cb.checked = false;
    } else {
      cb.checked = true;
    }
  });

  (document.getElementById("restore-import-merge") as HTMLInputElement).checked = true;

  const submitBtn = document.getElementById("restore-options-modal-submit");
  assert.ok(submitBtn);
  submitBtn.click();
  await flush(1000);

  assert.equal(appState.settings.theme, "light");
  assert.equal(appState.activities.length, 3);
  const current = appState.activities.find(a => a.id === "act-current");
  const overlap = appState.activities.find(a => a.id === "act-overlap");
  const newAct = appState.activities.find(a => a.id === "act-new");
  const ignored = appState.activities.find(a => a.id === "act-ignored");

  assert.ok(current);
  assert.ok(overlap);
  assert.equal(overlap.name, "New version");
  assert.ok(newAct);
  assert.equal(newAct.name, "Imported");
  assert.ok(!ignored);
});

test("handleJsonBackupFile renders diff preview summary and comparative badges", async () => {
  setAppState({
      settings: baseSettings({ theme: "dark", rooms: [{ id: "r1", name: "Salle Origine" }] }),
      activities: [
        { id: "act-same", name: "Identique" },
        { id: "act-modified", name: "Ancien Nom" },
        { id: "act-app-only", name: "Seulement App" }
      ] as any,
      favorites: [],
      selected_year: "PRE",
      selected_quarters: [1, 2, 3, 4]
    });

    handleJsonBackupFile(
      makeFile({
        activities: [
          { id: "act-same", name: "Identique" },
          { id: "act-modified", name: "Nouveau Nom" },
          { id: "act-new", name: "Nouvelle Activité" }
        ],
        settings: baseSettings({ theme: "dark", rooms: [{ id: "r1", name: "Salle Origine" }, { id: "r2", name: "Salle Ajoutée" }] })
      })
    );
    await flush(800);

    const summaryCard = document.getElementById("restore-diff-summary-card");
    assert.ok(summaryCard);
    assert.match(summaryCard!.textContent!, /Aperçu des différences/);
    assert.match(summaryCard!.textContent!, /1 nouvelle\(s\)/);
    assert.match(summaryCard!.textContent!, /1 modifiée\(s\)/);
    assert.match(summaryCard!.textContent!, /1 identique\(s\)/);
    assert.match(summaryCard!.textContent!, /1 non présente\(s\)/);

    const addedSummaryBadge = document.getElementById("restore-summary-badge-added");
    const addedDetails = document.getElementById("restore-added-details");
    assert.ok(addedSummaryBadge);
    assert.ok(addedDetails);
    assert.equal(addedDetails!.style.display, "none");

    addedSummaryBadge!.click();
    assert.equal(addedDetails!.style.display, "flex");
    assert.match(addedDetails!.innerHTML, /Nouvelles activités dans le fichier/);
    assert.match(addedDetails!.innerHTML, /act-new/);

    const modifiedSummaryBadge = document.getElementById("restore-summary-badge-modified");
    const modifiedDetails = document.getElementById("restore-modified-details");
    assert.ok(modifiedSummaryBadge);
    assert.ok(modifiedDetails);
    assert.equal(modifiedDetails!.style.display, "none");

    modifiedSummaryBadge!.click();
    assert.equal(modifiedDetails!.style.display, "flex");
    assert.equal(addedDetails!.style.display, "none");
    assert.match(modifiedDetails!.innerHTML, /Détail des activités modifiées/);
    assert.match(modifiedDetails!.innerHTML, /act-modified/);
    assert.match(modifiedDetails!.innerHTML, /Nouveau Nom/);
    assert.match(modifiedDetails!.innerHTML, /Ancien Nom/);

    const roomBadge = document.getElementById("restore-badge-rooms");
    assert.ok(roomBadge);
    assert.match(roomBadge!.textContent!, /Modifié/);

    const roomDetails = document.getElementById("restore-details-rooms");
    assert.ok(roomDetails);
    assert.equal(roomDetails!.style.display, "none");

    // Click badge to toggle details
    roomBadge!.click();
    assert.equal(roomDetails!.style.display, "flex");
    assert.match(roomDetails!.innerHTML, /Nouveau dans le fichier/);
    assert.match(roomDetails!.innerHTML, /Salle Ajoutée/);

    const customRadio = document.getElementById("restore-mode-custom") as HTMLInputElement;
    customRadio.click();
    customRadio.dispatchEvent(new Event("change", { bubbles: true }));

    const specRadio = document.getElementById("restore-act-select") as HTMLInputElement;
    specRadio.click();
    specRadio.dispatchEvent(new Event("change", { bubbles: true }));

    const btnAll = document.getElementById("restore-filter-all") as HTMLButtonElement;
    if (btnAll) btnAll.click();

    const checklist = document.getElementById("restore-activities-checklist")!;
    assert.ok(checklist);
    assert.match(checklist.innerHTML, /Nouveau/);
    assert.match(checklist.innerHTML, /Modifié \(Nom\)/);
    assert.match(checklist.innerHTML, /Identique/);

    // Click on a modified activity's diff badge to toggle field diff details
    const modifiedBadge = checklist.querySelector("span[title*='Changements: Nom']") as HTMLElement;
    assert.ok(modifiedBadge);

    const detailsContainer = modifiedBadge.closest("div")?.querySelector("div") as HTMLElement;
    assert.ok(detailsContainer);

    const initialDisplay = detailsContainer.style.display;
    modifiedBadge.click();
    assert.equal(detailsContainer.style.display, initialDisplay === "flex" ? "none" : "flex");
    assert.match(detailsContainer.innerHTML, /Changements comparés/);
    assert.match(detailsContainer.innerHTML, /Nouveau Nom/);
    assert.match(detailsContainer.innerHTML, /Ancien Nom/);
});

export {};




