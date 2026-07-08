import test from "node:test";
import assert from "node:assert/strict";

import { matchDistributionsToLedger, validateLedgerStructure, findBestColumnMatch } from "../js/reconciliation.ts";

const YEAR = "2025-2026";
const ALL_QUARTERS = [1, 2, 3, 4];

function activity(overrides) {
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

  const results = matchDistributionsToLedger(activities, ledger, YEAR, ALL_QUARTERS);
  assert.equal(results.length, 1);
  assert.equal(results[0].status, "valid");
});

test("marks a distribution as diff when the ledger amount doesn't match", () => {
  const activities = [activity({ distributions: [{ account_code: "892-1", reference: "RI001", amount: 100 }] })];
  const ledger = [{ "Date versée": "2025-08-15", "Poste budgétaire": "892-1", "No référence": "RI001", "Montant courant": -80 }];

  const results = matchDistributionsToLedger(activities, ledger, YEAR, ALL_QUARTERS);
  assert.equal(results[0].status, "diff");
  assert.equal(results[0].diff, 20);
});

test("marks a distribution without a matching ledger entry as unlogged", () => {
  const activities = [activity({ distributions: [{ account_code: "892-1", reference: "RI999", amount: 100 }] })];

  const results = matchDistributionsToLedger(activities, [], YEAR, ALL_QUARTERS);
  assert.equal(results[0].status, "unlogged");
});

test("marks a distribution with no reference as unlogged", () => {
  const activities = [activity({ distributions: [{ account_code: "892-1", reference: "", amount: 100 }] })];

  const results = matchDistributionsToLedger(activities, [], YEAR, ALL_QUARTERS);
  assert.equal(results[0].status, "unlogged");
});

test("marks a ledger entry with no matching activity distribution as unentered", () => {
  const ledger = [{ "Date versée": "2025-08-15", "Poste budgétaire": "892-1", "No référence": "RI001", "Montant courant": -100 }];

  const results = matchDistributionsToLedger([], ledger, YEAR, ALL_QUARTERS);
  assert.equal(results.length, 1);
  assert.equal(results[0].status, "unentered");
  assert.equal(results[0].amount_gl, 100);
});

test("sums multiple ledger transactions sharing the same account+reference before comparing", () => {
  const activities = [activity({ distributions: [{ account_code: "892-1", reference: "RI001", amount: 100 }] })];
  const ledger = [
    { "Date versée": "2025-08-05", "Poste budgétaire": "892-1", "No référence": "RI001", "Montant courant": -60 },
    { "Date versée": "2025-08-15", "Poste budgétaire": "892-1", "No référence": "RI001", "Montant courant": -40 }
  ];

  const results = matchDistributionsToLedger(activities, ledger, YEAR, ALL_QUARTERS);
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

  const results = matchDistributionsToLedger(activities, ledger, YEAR, ALL_QUARTERS);
  assert.equal(results.length, 2);
  assert.equal(results[0].status, "valid");
  assert.equal(results[1].status, "diff");
});

test("treats a zero-amount distribution matching a zero-amount ledger entry as valid, not unlogged", () => {
  const activities = [activity({ distributions: [{ account_code: "892-1", reference: "RI001", amount: 0 }] })];
  const ledger = [{ "Date versée": "2025-08-15", "Poste budgétaire": "892-1", "No référence": "RI001", "Montant courant": 0 }];

  const results = matchDistributionsToLedger(activities, ledger, YEAR, ALL_QUARTERS);
  assert.equal(results[0].status, "valid");
});

test("skips activities and ledger transactions outside the selected fiscal period", () => {
  const activities = [activity({ date_start: "2024-08-01", distributions: [{ account_code: "892-1", reference: "RI001", amount: 100 }] })];
  const ledger = [{ "Date versée": "2024-08-15", "Poste budgétaire": "892-1", "No référence": "RI001", "Montant courant": -100 }];

  const results = matchDistributionsToLedger(activities, ledger, YEAR, ALL_QUARTERS);
  assert.equal(results.length, 0);
});

test("ignores blank (unfilled) activities", () => {
  const activities = [activity({ name: "", distributions: [{ account_code: "892-1", reference: "RI001", amount: 100 }] })];

  const results = matchDistributionsToLedger(activities, [], YEAR, ALL_QUARTERS);
  assert.equal(results.length, 0);
});

test("ignores deleted activities in reconciliation matching", () => {
  const activities = [
    activity({ name: "Activité Supprimée", deleted: true, distributions: [{ account_code: "892-1", reference: "RI001", amount: 100 }] })
  ];
  const ledger = [{ "Date versée": "2025-08-15", "Poste budgétaire": "892-1", "No référence": "RI001", "Montant courant": -100 }];

  const results = matchDistributionsToLedger(activities, ledger, YEAR, ALL_QUARTERS);
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

  const results = matchDistributionsToLedger(activities, ledger, YEAR, ALL_QUARTERS);
  const unlogged = results.find(r => r.status === "unlogged");
  const unentered = results.find(r => r.status === "unentered");
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

  const results = matchDistributionsToLedger(activities, ledger, YEAR, ALL_QUARTERS);
  const unlogged = results.find(r => r.status === "unlogged");
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

  const results = matchDistributionsToLedger(activities, ledger, YEAR, ALL_QUARTERS);
  const unlogged = results.find(r => r.status === "unlogged");
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
  assert.match(validation.error, /Date versée/);
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
