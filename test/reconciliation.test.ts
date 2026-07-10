import test from "node:test";
import assert from "node:assert/strict";
import "./indexeddb-mock.ts";

import {
  matchDistributionsToLedger,
  validateLedgerStructure,
  findBestColumnMatch,
  cleanRef,
  extractRefFromNom,
  canonicalRefKey,
  daysBetweenDateStrs,
  reconcileLedger,
  reconciliationState,
  loadReconDecisions,
  setReconDecision
} from "../src/services/reconciliation.ts";
import { appState } from "../src/state/state.ts";

const YEAR = "2025-2026";
const ALL_QUARTERS = [1, 2, 3, 4];

function activity(overrides: any) {
  return {
    id: "act-1",
    name: "Activité test",
    date_start: "2025-08-01",
    distributions: [],
    ...overrides
  };
}

test("marks a distribution as valid when the ledger amount matches within 2 cents", () => {
  const activities = [activity({ distributions: [{ account_code: "892-1", reference: "RI001", amount: 100 }] })];
  const ledger = [{ "Date versée": "2025-08-15", "Poste budgétaire": "892-1", "No référence": "RI001", "Montant courant": -100 }];

  const results = matchDistributionsToLedger(activities as any[], ledger, YEAR, ALL_QUARTERS);
  assert.equal(results.length, 1);
  assert.equal(results[0].status, "valid");
});

test("marks a distribution as diff when the ledger amount doesn't match", () => {
  const activities = [activity({ distributions: [{ account_code: "892-1", reference: "RI001", amount: 100 }] })];
  const ledger = [{ "Date versée": "2025-08-15", "Poste budgétaire": "892-1", "No référence": "RI001", "Montant courant": -80 }];

  const results = matchDistributionsToLedger(activities as any[], ledger, YEAR, ALL_QUARTERS);
  assert.equal(results[0].status, "diff");
  assert.equal((results[0] as any).diff, 20);
});

test("marks a distribution without a matching ledger entry as unlogged", () => {
  const activities = [activity({ distributions: [{ account_code: "892-1", reference: "RI999", amount: 100 }] })];

  const results = matchDistributionsToLedger(activities as any[], [], YEAR, ALL_QUARTERS);
  assert.equal(results[0].status, "unlogged");
});

test("marks a distribution with no reference as unlogged", () => {
  const activities = [activity({ distributions: [{ account_code: "892-1", reference: "", amount: 100 }] })];

  const results = matchDistributionsToLedger(activities as any[], [], YEAR, ALL_QUARTERS);
  assert.equal(results[0].status, "unlogged");
});

test("marks a ledger entry with no matching activity distribution as unentered", () => {
  const ledger = [{ "Date versée": "2025-08-15", "Poste budgétaire": "892-1", "No référence": "RI001", "Montant courant": -100 }];

  const results = matchDistributionsToLedger([], ledger, YEAR, ALL_QUARTERS);
  assert.equal(results.length, 1);
  assert.equal(results[0].status, "unentered");
  assert.equal((results[0] as any).amount_gl, 100);
});

test("sums multiple ledger transactions sharing the same account+reference before comparing", () => {
  const activities = [activity({ distributions: [{ account_code: "892-1", reference: "RI001", amount: 100 }] })];
  const ledger = [
    { "Date versée": "2025-08-05", "Poste budgétaire": "892-1", "No référence": "RI001", "Montant courant": -60 },
    { "Date versée": "2025-08-15", "Poste budgétaire": "892-1", "No référence": "RI001", "Montant courant": -40 }
  ];

  const results = matchDistributionsToLedger(activities as any[], ledger, YEAR, ALL_QUARTERS);
  assert.equal(results.length, 1);
  assert.equal(results[0].status, "valid"); // -60 + -40 = -100 -> expected revenue 100
});

test("evaluates two distributions sharing the same account+reference independently against the same ledger group", () => {
  const activities = [
    activity({
      id: "act-1",
      distributions: [
        { account_code: "892-1", reference: "RI001", amount: 100 },
        { account_code: "892-1", reference: "RI001", amount: 999 }
      ]
    })
  ];
  const ledger = [{ "Date versée": "2025-08-15", "Poste budgétaire": "892-1", "No référence": "RI001", "Montant courant": -100 }];

  const results = matchDistributionsToLedger(activities as any[], ledger, YEAR, ALL_QUARTERS);
  assert.equal(results.length, 2);
  assert.equal(results[0].status, "valid");
  assert.equal(results[1].status, "diff");
});

test("treats a zero-amount distribution matching a zero-amount ledger entry as valid, not unlogged", () => {
  const activities = [activity({ distributions: [{ account_code: "892-1", reference: "RI001", amount: 0 }] })];
  const ledger = [{ "Date versée": "2025-08-15", "Poste budgétaire": "892-1", "No référence": "RI001", "Montant courant": 0 }];

  const results = matchDistributionsToLedger(activities as any[], ledger, YEAR, ALL_QUARTERS);
  assert.equal(results[0].status, "valid");
});

test("skips activities and ledger transactions outside the selected fiscal period", () => {
  const activities = [activity({ date_start: "2024-08-01", distributions: [{ account_code: "892-1", reference: "RI001", amount: 100 }] })];
  const ledger = [{ "Date versée": "2024-08-15", "Poste budgétaire": "892-1", "No référence": "RI001", "Montant courant": -100 }];

  const results = matchDistributionsToLedger(activities as any[], ledger, YEAR, ALL_QUARTERS);
  assert.equal(results.length, 0);
});

test("ignores blank (unfilled) activities", () => {
  const activities = [activity({ name: "", distributions: [{ account_code: "892-1", reference: "RI001", amount: 100 }] })];

  const results = matchDistributionsToLedger(activities as any[], [], YEAR, ALL_QUARTERS);
  assert.equal(results.length, 0);
});

test("ignores deleted activities in reconciliation matching", () => {
  const activities = [
    activity({ name: "Activité Supprimée", deleted: true, distributions: [{ account_code: "892-1", reference: "RI001", amount: 100 }] })
  ];
  const ledger = [{ "Date versée": "2025-08-15", "Poste budgétaire": "892-1", "No référence": "RI001", "Montant courant": -100 }];

  const results = matchDistributionsToLedger(activities as any[], ledger, YEAR, ALL_QUARTERS);
  // It should be treated as unentered in the ledger, because the app activity is ignored/deleted
  assert.equal(results.length, 1);
  assert.equal(results[0].status, "unentered");
});

test("suggests a fuzzy match when the amount and date are close but the référence differs (typo)", () => {
  const activities = [
    activity({
      name: "Location de salle",
      date_start: "2025-08-15",
      distributions: [{ account_code: "892-1", reference: "RI001", amount: 100 }]
    })
  ];
  // Same compte, close amount (+0.03) and date (2 days later), but a completely different référence
  const ledger = [{ "Date versée": "2025-08-17", "Poste budgétaire": "892-1", "No référence": "RI999", "Montant courant": -100.03 }];

  const results = matchDistributionsToLedger(activities as any[], ledger, YEAR, ALL_QUARTERS);
  const unlogged = results.find(r => r.status === "unlogged") as any;
  const unentered = results.find(r => r.status === "unentered") as any;
  assert.ok(unlogged.suggestions && unlogged.suggestions.length === 1);
  assert.equal(unlogged.suggestions[0].reference, "RI999");
  assert.ok(unentered.suggestedFor.includes("Location de salle"));
});

test("suggests a fuzzy match based on text similarity when amount/date are not close", () => {
  const activities = [
    activity({
      name: "Conférence sur le climat",
      date_start: "2025-08-01",
      distributions: [{ account_code: "892-1", reference: "RI001", amount: 100 }]
    })
  ];
  // Far in amount and date, but the GL description shares words with the activity name
  const ledger = [
    { "Date versée": "2025-11-20", "Poste budgétaire": "892-1", "No référence": "RI999", "Montant courant": -40, Description: "conference climat" }
  ];

  const results = matchDistributionsToLedger(activities as any[], ledger, YEAR, ALL_QUARTERS);
  const unlogged = results.find(r => r.status === "unlogged") as any;
  assert.ok(unlogged.suggestions && unlogged.suggestions.length === 1);
  assert.equal(unlogged.suggestions[0].reference, "RI999");
});

test("does not suggest a match when neither amount/date nor text are close", () => {
  const activities = [
    activity({
      name: "Spectacle de danse",
      date_start: "2025-08-01",
      distributions: [{ account_code: "892-1", reference: "RI001", amount: 100 }]
    })
  ];
  const ledger = [
    { "Date versée": "2025-12-25", "Poste budgétaire": "892-1", "No référence": "RI999", "Montant courant": -40, Description: "vente de billets" }
  ];

  const results = matchDistributionsToLedger(activities as any[], ledger, YEAR, ALL_QUARTERS);
  const unlogged = results.find(r => r.status === "unlogged") as any;
  assert.equal(unlogged.suggestions, undefined);
});

test("validateLedgerStructure returns valid=true for correct ledger rows", () => {
  const correctRows = [
    { "Poste budgétaire": "892-123", "Date versée": "2025-08-01", "Montant courant": -100, "No référence": "RI001" }
  ];
  const validation = validateLedgerStructure(correctRows);
  assert.equal(validation.valid, true);
});

test("validateLedgerStructure returns valid=false and error details for missing columns", () => {
  const incorrectRows = [
    { "Poste budgétaire": "892-123", "Montant courant": -100 } // Missing Date versée
  ];
  const validation = validateLedgerStructure(incorrectRows);
  assert.equal(validation.valid, false);
  assert.match(validation.error!, /Date versée/);
});

test("validateLedgerStructure returns valid=false for empty ledger file", () => {
  assert.equal(validateLedgerStructure([]).valid, false);
  assert.equal(validateLedgerStructure(null).valid, false);
});

test("validateLedgerStructure treats a ledger made only of total rows as still structurally valid", () => {
  // validateLedgerStructure only checks the required columns exist on the first row; it does not
  // filter out "Total"/"Grand Total" rows itself (that's the caller's job downstream).
  const totalsOnly = [{ "Poste budgétaire": "Total", "Date versée": "", "Montant courant": 0 }];
  assert.equal(validateLedgerStructure(totalsOnly).valid, true);
});

test("findBestColumnMatch matches header/candidate names ignoring accents and case", () => {
  const headers = ["Poste Budgétaire", "Date versée", "No Référence"];
  assert.equal(findBestColumnMatch(headers, ["poste budgetaire"]), "Poste Budgétaire");
  assert.equal(findBestColumnMatch(headers, ["REFERENCE"]), "No Référence");
});

test("findBestColumnMatch matches when one name is a substring of the other", () => {
  const headers = ["Numéro de référence interne"];
  assert.equal(findBestColumnMatch(headers, ["référence"]), "Numéro de référence interne");
});

test("findBestColumnMatch returns the first possible name that matches, in priority order", () => {
  const headers = ["Compte", "Poste budgétaire"];
  assert.equal(findBestColumnMatch(headers, ["poste budgetaire", "compte"]), "Poste budgétaire");
});

test("findBestColumnMatch returns an empty string when nothing matches", () => {
  assert.equal(findBestColumnMatch(["Colonne inconnue"], ["poste budgetaire"]), "");
  assert.equal(findBestColumnMatch([], ["poste budgetaire"]), "");
});

test("cleanRef handles null, undefined, spaces and Excel float suffix (.0)", () => {
  assert.equal(cleanRef(null), "");
  assert.equal(cleanRef(undefined), "");
  assert.equal(cleanRef("  ri001  "), "RI001");
  assert.equal(cleanRef("12345.0"), "12345");
  assert.equal(cleanRef(123.0 as any), "123");
});

test("matchDistributionsToLedger chooses RI code from Nom when available", () => {
  const activities = [activity({ distributions: [{ account_code: "892-1", reference: "RI001", amount: 100 }] })];
  // Nom starts with RI, No référence is something else
  const ledger = [{ "Date versée": "2025-08-15", "Poste budgétaire": "892-1", "No référence": "123456", "Nom": "RI001", "Montant courant": -100 }];
  
  const results = matchDistributionsToLedger(activities as any[], ledger, YEAR, ALL_QUARTERS);
  assert.equal(results.length, 1);
  assert.equal(results[0].status, "valid");
  assert.equal(results[0].reference, "RI001");
});

test("matchDistributionsToLedger extracts the RI code from Nom even when surrounded by other text", () => {
  const activities = [activity({ distributions: [{ account_code: "892-1", reference: "RI001", amount: 100 }] })];
  const ledger = [{ "Date versée": "2025-08-15", "Poste budgétaire": "892-1", "No référence": "123456", "Nom": "PAIEMENT RI001 SALLE X", "Montant courant": -100 }];

  const results = matchDistributionsToLedger(activities as any[], ledger, YEAR, ALL_QUARTERS);
  assert.equal(results.length, 1);
  assert.equal(results[0].status, "valid");
  assert.equal(results[0].reference, "RI001");
});

test("matchDistributionsToLedger extracts a bare numeric reference from Nom even when surrounded by other text", () => {
  const activities = [activity({ distributions: [{ account_code: "892-1", reference: "123456", amount: 100 }] })];
  const ledger = [{ "Date versée": "2025-08-15", "Poste budgétaire": "892-1", "No référence": "", "Nom": "VIREMENT 123456 CLIENT Y", "Montant courant": -100 }];

  const results = matchDistributionsToLedger(activities as any[], ledger, YEAR, ALL_QUARTERS);
  assert.equal(results.length, 1);
  assert.equal(results[0].status, "valid");
  assert.equal(results[0].reference, "123456");
});

test("matchDistributionsToLedger matches when the activity reference has no RI prefix but Nom's embedded code does", () => {
  const activities = [activity({ distributions: [{ account_code: "892-1", reference: "162729", amount: 100 }] })];
  const ledger = [{ "Date versée": "2025-08-15", "Poste budgétaire": "892-1", "No référence": "", "Nom": "bla bla RI162729 blablabla", "Montant courant": -100 }];

  const results = matchDistributionsToLedger(activities as any[], ledger, YEAR, ALL_QUARTERS);
  assert.equal(results.length, 1);
  assert.equal(results[0].status, "valid");
});

test("reconcileLedger performs match and applies local reconciliationState.decisions review statuses", () => {
  // Save previous state to restore later
  const prevActivities = appState.activities;
  const prevYear = appState.selected_year;
  const prevQuarters = appState.selected_quarters;
  const prevLedgerTx = reconciliationState.ledgerTransactions;
  const prevDecisions = reconciliationState.decisions;
  const prevResults = reconciliationState.results;
  
  try {
    appState.activities = [
      activity({ distributions: [{ account_code: "892-1", reference: "RI001", amount: 100 }] }) as any,
      activity({ id: "act-2", distributions: [{ account_code: "892-2", reference: "RI002", amount: 200 }] }) as any
    ];
    appState.selected_year = YEAR;
    appState.selected_quarters = ALL_QUARTERS;
    
    // Ledgers: RI001 matches perfectly (100). RI002 does not match at all (unlogged).
    reconciliationState.ledgerTransactions = [
      { "Date versée": "2025-08-15", "Poste budgétaire": "892-1", "No référence": "RI001", "Montant courant": -100 }
    ];
    
    // Mock a manual decision for RI002
    reconciliationState.decisions = {
      "892-2||RI002": { key: "892-2||RI002", status: "validated", note: "Approuvé manuellement" }
    };
    
    reconcileLedger();
    
    const results = reconciliationState.results;
    assert.equal(results.length, 2);
    
    const r1 = results.find(r => r.reference === "RI001") as any;
    assert.equal(r1.status, "valid");
    assert.equal(r1.reviewStatus, "");
    
    const r2 = results.find(r => r.reference === "RI002") as any;
    assert.equal(r2.status, "unlogged");
    assert.equal(r2.reviewStatus, "validated"); // review status was successfully applied from decisions!
    
  } finally {
    // Restore state
    appState.activities = prevActivities;
    appState.selected_year = prevYear;
    appState.selected_quarters = prevQuarters;
    reconciliationState.ledgerTransactions = prevLedgerTx;
    reconciliationState.decisions = prevDecisions;
    reconciliationState.results = prevResults;
  }
});
test("canonicalRefKey strips the optional RI prefix so 'RI001' and '001' join the same group", () => {
  assert.equal(canonicalRefKey("RI001"), "001");
  assert.equal(canonicalRefKey("001"), "001");
  assert.equal(canonicalRefKey(""), "");
});

test("extractRefFromNom returns an empty string when Nom has neither an RI code nor a 4+ digit number", () => {
  assert.equal(extractRefFromNom("PAIEMENT DIVERS"), "");
  assert.equal(extractRefFromNom(""), "");
  assert.equal(extractRefFromNom(null), "");
  assert.equal(extractRefFromNom("Facture #12"), ""); // only 2 digits, below the 4-digit threshold
});

test("daysBetweenDateStrs returns the absolute day difference, and Infinity for missing/invalid dates", () => {
  assert.equal(daysBetweenDateStrs("2025-08-01", "2025-08-06"), 5);
  assert.equal(daysBetweenDateStrs("2025-08-06", "2025-08-01"), 5); // order-independent
  assert.equal(daysBetweenDateStrs("", "2025-08-01"), Infinity);
  assert.equal(daysBetweenDateStrs("2025-08-01", ""), Infinity);
  assert.equal(daysBetweenDateStrs("not-a-date", "2025-08-01"), Infinity);
});

test("matchDistributionsToLedger drops a ledger transaction with no usable reference (neither No référence nor Nom) instead of surfacing it as unentered", () => {
  const ledger = [{ "Date versée": "2025-08-15", "Poste budgétaire": "892-1", "No référence": "", "Nom": "", "Montant courant": -100 }];

  const results = matchDistributionsToLedger([], ledger, YEAR, ALL_QUARTERS);
  assert.equal(results.length, 0);
});

test("matchDistributionsToLedger groups ledger transactions with a missing/blank Poste budgétaire under an empty account code", () => {
  const activities = [activity({ distributions: [{ account_code: "", reference: "RI001", amount: 100 }] })];
  const ledger = [{ "Date versée": "2025-08-15", "Poste budgétaire": "", "No référence": "RI001", "Montant courant": -100 }];

  const results = matchDistributionsToLedger(activities as any[], ledger, YEAR, ALL_QUARTERS);
  assert.equal(results.length, 1);
  assert.equal(results[0].status, "valid");
});

test("matchDistributionsToLedger skips a ledger transaction whose date falls outside the selected fiscal quarters, even if the year matches", () => {
  // Activity in fiscal Q2 (Oct-Dec) so it passes the period filter, but its matching ledger
  // transaction is in Q1 (Jul-Sep) — excluding quarter 1 should leave the distribution unlogged
  // instead of matched, since the ledger side never enters ledgerGroups for that period.
  const activities = [
    activity({ date_start: "2025-10-15", distributions: [{ account_code: "892-1", reference: "RI001", amount: 100 }] })
  ];
  const ledger = [{ "Date versée": "2025-08-15", "Poste budgétaire": "892-1", "No référence": "RI001", "Montant courant": -100 }];

  const results = matchDistributionsToLedger(activities as any[], ledger, YEAR, [2, 3, 4]);
  assert.equal(results.length, 1);
  assert.equal(results[0].status, "unlogged");
});

test("attachFuzzyMatchSuggestions caps suggestions at 3 candidates, ordered by non-increasing score", () => {
  const activities = [
    activity({
      name: "Location de salle",
      date_start: "2025-08-15",
      distributions: [{ account_code: "892-1", reference: "RI001", amount: 100 }]
    })
  ];
  // 4 unentered candidates on the same account, all within fuzzy amount/date tolerance — only
  // the top 3 by score should be kept. RI900's GL description also matches the activity name, so
  // it should score strictly higher than the other three (which have no description at all).
  const ledger = [
    { "Date versée": "2025-08-15", "Poste budgétaire": "892-1", "No référence": "RI900", "Montant courant": -100, Description: "Location de salle" },
    { "Date versée": "2025-08-16", "Poste budgétaire": "892-1", "No référence": "RI901", "Montant courant": -99.98 },
    { "Date versée": "2025-08-17", "Poste budgétaire": "892-1", "No référence": "RI902", "Montant courant": -99.97 },
    { "Date versée": "2025-08-18", "Poste budgétaire": "892-1", "No référence": "RI903", "Montant courant": -99.96 }
  ];

  const results = matchDistributionsToLedger(activities as any[], ledger, YEAR, ALL_QUARTERS);
  const unlogged = results.find(r => r.status === "unlogged") as any;
  assert.equal(unlogged.suggestions.length, 3);
  assert.equal(unlogged.suggestions[0].reference, "RI900");
  for (let i = 1; i < unlogged.suggestions.length; i++) {
    assert.ok(unlogged.suggestions[i - 1].score >= unlogged.suggestions[i].score);
  }
});

test("attachFuzzyMatchSuggestions records every unlogged activity that suggested the same unentered candidate", () => {
  const activities = [
    activity({
      id: "act-1",
      name: "Conférence A",
      date_start: "2025-08-15",
      distributions: [{ account_code: "892-1", reference: "RI001", amount: 100 }]
    }),
    activity({
      id: "act-2",
      name: "Conférence B",
      date_start: "2025-08-15",
      distributions: [{ account_code: "892-1", reference: "RI002", amount: 100.01 }]
    })
  ];
  // A single unentered candidate close in amount/date to both activities' unlogged distributions.
  const ledger = [{ "Date versée": "2025-08-15", "Poste budgétaire": "892-1", "No référence": "RI999", "Montant courant": -100 }];

  const results = matchDistributionsToLedger(activities as any[], ledger, YEAR, ALL_QUARTERS);
  const unentered = results.find(r => r.status === "unentered") as any;
  assert.deepEqual(unentered.suggestedFor.sort(), ["Conférence A", "Conférence B"]);
});

test("setReconDecision persists a decision to IndexedDB and loadReconDecisions reads it back", async () => {
  const prevDecisions = reconciliationState.decisions;
  try {
    reconciliationState.decisions = {};
    await setReconDecision("892-1||RI001", "validated", "Approuvé");

    await loadReconDecisions();
    assert.equal(reconciliationState.decisions["892-1||RI001"].status, "validated");
    assert.equal(reconciliationState.decisions["892-1||RI001"].note, "Approuvé");

    // Clearing (empty status) should delete the decision, both in memory and once reloaded.
    await setReconDecision("892-1||RI001", "");
    assert.equal(reconciliationState.decisions["892-1||RI001"], undefined);
    await loadReconDecisions();
    assert.equal(reconciliationState.decisions["892-1||RI001"], undefined);
  } finally {
    reconciliationState.decisions = prevDecisions;
  }
});

test("setReconDecision is a no-op when called with an empty key", async () => {
  const prevDecisions = reconciliationState.decisions;
  try {
    reconciliationState.decisions = {};
    await setReconDecision("", "validated");
    assert.deepEqual(reconciliationState.decisions, {});
  } finally {
    reconciliationState.decisions = prevDecisions;
  }
});

export {};
