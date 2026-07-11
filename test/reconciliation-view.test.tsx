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

import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { setAppState } from "../src/state/state.ts";
import { reconciliationState, reconcileLedger } from "../src/services/reconciliation.ts";
import { ReconciliationView } from "../src/components/reconciliation-view.tsx";

const YEAR = "2025-2026";
const ALL_QUARTERS = [1, 2, 3, 4];

function baseState(overrides: any = {}) {
  return {
    settings: {
      theme: "dark",
      rooms: [],
      departments: [],
      accounts: [{ code: "892-1", description: "Location de salles" }],
      last_backup_date: "",
      backup_reminder_days: 7,
      salaries: [],
      services: [],
      global_tasks: [],
      schedulable_tasks: []
    },
    activities: [],
    favorites: [],
    selected_year: YEAR,
    selected_quarters: ALL_QUARTERS,
    ...overrides
  };
}

function activity(overrides: any = {}) {
  return {
    id: "act-1",
    name: "Activité test",
    date_start: "2025-08-01",
    distributions: [],
    deleted: false,
    ...overrides
  };
}

// Drives the real matching engine (not hand-built result fixtures) so row shapes (reviewKey,
// ledgerTxs, suggestions, ...) stay faithful to what reconcileLedger() actually produces.
function setupReconciledState(activities: any[], ledgerRows: any[]) {
  setAppState(baseState({ activities }));
  reconciliationState.ledgerTransactions = ledgerRows;
  reconciliationState.decisions = {};
  reconcileLedger();
  reconciliationState.imported = true;
  reconciliationState.filter = "all";
  reconciliationState.page = 1;
  reconciliationState.pageSize = 10;
}

test.beforeEach(() => {
  setAppState(baseState());
  reconciliationState.ledgerTransactions = [];
  reconciliationState.results = [];
  reconciliationState.decisions = {};
  reconciliationState.imported = false;
  reconciliationState.filter = "all";
  reconciliationState.page = 1;
  reconciliationState.pageSize = 10;
  (globalThis as any).localStorage.clear();
  document.body.innerHTML = "";
});

test.afterEach(() => cleanup());

test("shows the drop zone instead of the results table before anything has been imported", () => {
  const { container } = render(<ReconciliationView />);
  assert.ok(container.querySelector("#drop-zone"));
  assert.equal(container.querySelector("#reconciliation-panel"), null);
});

test("shows the summary counts and results table once a ledger has been reconciled", () => {
  setupReconciledState(
    [
      activity({ id: "act-1", distributions: [{ account_code: "892-1", reference: "RI001", amount: 100 }] }),
      activity({ id: "act-2", distributions: [{ account_code: "892-1", reference: "RI002", amount: 100 }] })
    ],
    [
      { "Date versée": "2025-08-15", "Poste budgétaire": "892-1", "No référence": "RI001", "Montant courant": -100 },
      { "Date versée": "2025-08-16", "Poste budgétaire": "892-1", "No référence": "RI002", "Montant courant": -80 }
    ]
  );

  const { container, getByText } = render(<ReconciliationView />);

  assert.equal(container.querySelector("#drop-zone"), null);
  assert.ok(container.querySelector("#reconciliation-panel"));
  assert.equal(reconciliationState.results.length, 2);
  getByText("Tous (2)");
  getByText("Validés (1)");
  getByText("Écarts (1)");
});

test("clicking a filter tab shows only the matching rows and marks that tab active", () => {
  setupReconciledState(
    [
      activity({ id: "act-1", distributions: [{ account_code: "892-1", reference: "RI001", amount: 100 }] }),
      activity({ id: "act-2", distributions: [{ account_code: "892-1", reference: "RI002", amount: 100 }] })
    ],
    [{ "Date versée": "2025-08-15", "Poste budgétaire": "892-1", "No référence": "RI001", "Montant courant": -100 }]
    // act-2's RI002 has no matching ledger line: unlogged
  );

  const { container, getByText } = render(<ReconciliationView />);
  const rows = () => container.querySelectorAll("tbody tr");
  assert.equal(rows().length, 2);

  fireEvent.click(getByText("Non dans GL (1)"));

  assert.equal(rows().length, 1);
  assert.match(rows()[0].textContent!, /act-2/);
  assert.equal(getByText("Non dans GL (1)").classList.contains("active"), true);
  assert.equal(getByText("Tous (2)").classList.contains("active"), false);
});

test("shows the empty-state message when a filter tab has no matching rows", () => {
  setupReconciledState(
    [activity({ distributions: [{ account_code: "892-1", reference: "RI001", amount: 100 }] })],
    [{ "Date versée": "2025-08-15", "Poste budgétaire": "892-1", "No référence": "RI001", "Montant courant": -100 }]
    // Only a "valid" result exists: no diff/unlogged/unentered rows
  );

  const { getByText } = render(<ReconciliationView />);
  fireEvent.click(getByText("Écarts (0)"));

  getByText("Aucun enregistrement dans cette catégorie.");
});

test("'Effacer l'import' clears the ledger/results and shows the drop zone again", () => {
  setupReconciledState(
    [activity({ distributions: [{ account_code: "892-1", reference: "RI001", amount: 100 }] })],
    [{ "Date versée": "2025-08-15", "Poste budgétaire": "892-1", "No référence": "RI001", "Montant courant": -100 }]
  );

  const { container, getByText } = render(<ReconciliationView />);
  fireEvent.click(getByText("Effacer l'import"));

  assert.ok(container.querySelector("#drop-zone"));
  assert.equal(container.querySelector("#reconciliation-panel"), null);
  assert.equal(reconciliationState.imported, false);
  assert.equal(reconciliationState.results.length, 0);
  assert.equal(reconciliationState.ledgerTransactions.length, 0);
});

test("the help banner starts visible and 'Masquer l'aide' hides it, persisting the choice to localStorage", () => {
  setupReconciledState(
    [activity({ distributions: [{ account_code: "892-1", reference: "RI001", amount: 100 }] })],
    [{ "Date versée": "2025-08-15", "Poste budgétaire": "892-1", "No référence": "RI001", "Montant courant": -100 }]
  );

  const { container, getByText } = render(<ReconciliationView />);
  assert.ok(container.querySelector(".reconcile-help-banner"));

  fireEvent.click(getByText("Masquer l'aide"));

  assert.equal(container.querySelector(".reconcile-help-banner"), null);
  assert.equal((globalThis as any).localStorage.getItem("outil_marie_recon_show_help"), "false");
  getByText("Afficher l'aide (?)");
});

test("a 'diff' row shows the signed amount gap and Valider/Ignorer buttons", () => {
  setupReconciledState(
    [activity({ distributions: [{ account_code: "892-1", reference: "RI001", amount: 100 }] })],
    [{ "Date versée": "2025-08-15", "Poste budgétaire": "892-1", "No référence": "RI001", "Montant courant": -80 }]
  );

  const { getByText } = render(<ReconciliationView />);
  getByText("+20,00 $");
  getByText("Valider");
  getByText("Ignorer");
});

test("an 'unentered' row (GL-only) shows the '+ Créer activité' action, alongside the manual review buttons", () => {
  setupReconciledState(
    [],
    [{ "Date versée": "2025-08-15", "Poste budgétaire": "892-1", "No référence": "RI001", "Montant courant": -100 }]
  );

  const { container } = render(<ReconciliationView />);
  assert.ok(container.querySelector("tbody button"));
  assert.match(container.querySelector("tbody button")!.textContent!, /Créer activité/);
  // Still reviewable (validated/ignored) like any non-"valid" row, since it has a reviewKey.
  assert.ok(container.querySelector(".btn-recon-validate"));
  assert.ok(container.querySelector(".btn-recon-ignore"));
});

test("clicking 'Valider' on a diff row persists the manual review and displays the confirmation note", async () => {
  setupReconciledState(
    [activity({ distributions: [{ account_code: "892-1", reference: "RI001", amount: 100 }] })],
    [{ "Date versée": "2025-08-15", "Poste budgétaire": "892-1", "No référence": "RI001", "Montant courant": -80 }]
  );

  const { getByText } = render(<ReconciliationView />);
  fireEvent.click(getByText("Valider"));

  await waitFor(() => getByText("✓ Validé manuellement"));
  assert.equal(reconciliationState.results[0].reviewStatus, "validated");
});

test("opening the GL detail modal shows the underlying ledger transactions, and closing it hides them again", () => {
  setupReconciledState(
    [activity({ distributions: [{ account_code: "892-1", reference: "RI001", amount: 100 }] })],
    [{ "Date versée": "2025-08-15", "Poste budgétaire": "892-1", "No référence": "RI001", "Montant courant": -80 }]
  );

  const { getByText, container } = render(<ReconciliationView />);
  fireEvent.click(getByText("Détails GL"));

  assert.equal(container.querySelector("#recon-detail-modal")!.classList.contains("active"), true);
  assert.match(container.querySelector("#recon-detail-modal .modal-content")!.textContent!, /2025-08-15/);

  fireEvent.click(getByText("Fermer"));
  assert.equal(container.querySelector("#recon-detail-modal")!.classList.contains("active"), false);
  assert.equal(container.querySelector("#recon-detail-modal .modal-content"), null);
});

export {};
