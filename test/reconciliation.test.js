const test = require("node:test");
const assert = require("node:assert/strict");

// reconciliation.js's matchDistributionsToLedger() calls getFiscalYear/getQuarterNumber as
// globals (they're plain <script> globals in the browser); wire them up before requiring it.
const { getFiscalYear, getQuarterNumber } = require("../js/state.js");
global.getFiscalYear = getFiscalYear;
global.getQuarterNumber = getQuarterNumber;
const { matchDistributionsToLedger } = require("../js/reconciliation.js");

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
