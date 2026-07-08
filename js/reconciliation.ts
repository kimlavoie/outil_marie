/**
 * reconciliation.ts - Reconciliation ("Rapprochement Comptable") engine + state: matching
 * activity distributions against an imported GL ledger, fuzzy-match suggestions, and the
 * manual-decision store. Pure/DOM-free by design (see matchDistributionsToLedger's own doc
 * comment) so it can be unit-tested directly and imported by plain `node --test` — the actual
 * view (drop zone, table, modals) is js/reconciliation-view.tsx (React, Phase 4's final step,
 * see TODO.txt), which imports the engine from here rather than the other way around, same split
 * as js/dashboard.js/js/dashboard-view.tsx.
 */
import { validateRules } from "./validation.ts";
import { logError } from "./logger.ts";
import { textSimilarity } from "./fuzzy-match.ts";
import { appState, getFiscalYear, getQuarterNumber, parseLocalDateStr, getReconDecisionsFromDb, saveReconDecisionToDb, deleteReconDecisionFromDb } from "./state.js";

// Reconciliation view/engine state, grouped so ledger data and UI state live together
const reconciliationState = {
  ledgerTransactions: [] as any[],
  results: [] as any[],
  filter: "all",
  page: 1,
  pageSize: 10,
  // Manually-reviewed lines, keyed by "account_code||reference" (see getReconDecisionsFromDb),
  // so decisions survive from one GL import to the next.
  decisions: {} as Record<string, any>,
  // Whether a ledger file has been imported (drives the view's drop-zone vs results-panel
  // display) — set by js/reconciliation-view.tsx's handleLedgerFile()/applyColumnMappingAndImport()
  // on success, cleared by its "Effacer l'import" button.
  imported: false
};

// Loads previously-saved reconciliation decisions from IndexedDB into reconciliationState.decisions.
// Called once on startup; safe to call again (e.g. after a decision changes) to stay in sync.
async function loadReconDecisions() {
  try {
    const list = await getReconDecisionsFromDb();
    reconciliationState.decisions = {};
    list.forEach((d: any) => {
      reconciliationState.decisions[d.key] = d;
    });
  } catch (e) {
    logError("reconciliation", "chargement des décisions de rapprochement", e);
  }
}

// Marks (or clears, when status is "") a reconciliation line as manually validated/ignored.
// Doesn't re-render anything itself (that's the caller's job — js/reconciliation-view.tsx calls
// reconcileLedger() + its own re-render after awaiting this) to keep this file DOM-free.
async function setReconDecision(key: string, status: string, note = "") {
  if (!key) return;
  if (!status) {
    delete reconciliationState.decisions[key];
    try {
      await deleteReconDecisionFromDb(key);
    } catch (e) {
      logError("reconciliation", "suppression d'une décision de rapprochement", e);
    }
  } else {
    const decision = { key, status, note, timestamp: new Date().toISOString() };
    reconciliationState.decisions[key] = decision;
    try {
      await saveReconDecisionToDb(decision);
    } catch (e) {
      logError("reconciliation", "sauvegarde d'une décision de rapprochement", e);
    }
  }
}

// Format reference key: uppercased, trimmed, and stripped of the trailing ".0" Excel adds when
// a numeric reference column is read as a float.
function cleanRef(val: any) {
  if (val === undefined || val === null) return "";
  let s = String(val).trim().toUpperCase();
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  return s;
}

function validateLedgerStructure(rawRows: any) {
  const firstRow = Array.isArray(rawRows) && rawRows.length > 0 ? rawRows[0] : null;
  const requiredColumns = ["Poste budgétaire", "Date versée", "Montant courant"];
  const missingColumns: string[] = firstRow ? requiredColumns.filter(col => !(col in firstRow)) : [];

  return validateRules([
    [!!firstRow, "Le fichier Excel est vide ou ne contient aucune ligne de données."],
    [
      missingColumns.length === 0,
      `Colonnes obligatoires manquantes dans le fichier Excel : ${missingColumns.join(", ")}. Veuillez vérifier que le fichier provient bien du Grand Livre.`
    ]
  ]);
}

function findBestColumnMatch(headers: string[], possibleNames: string[]) {
  for (const name of possibleNames) {
    const matched = headers.find(h => {
      const cleanH = h
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
      const cleanName = name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
      return cleanH === cleanName || cleanH.includes(cleanName) || cleanName.includes(cleanH);
    });
    if (matched) return matched;
  }
  return "";
}

// Reconciliation Engine Algorithm (pure: no DOM, no globals besides its arguments) — matches
// each activity distribution against the imported GL ledger for the selected fiscal
// year/quarters. Kept separate from reconcileLedger() so it can be unit tested directly.
function matchDistributionsToLedger(activities: any[], ledgerTransactions: any[], selectedYear: string, selectedQuarters: number[]) {
  const results: any[] = [];

  // 1. Group ledger transactions by Account & Clean Reference
  const ledgerGroups: Record<string, any> = {};

  ledgerTransactions.forEach(tx => {
    // Period filter: Check transaction date against selected year and quarters
    const txDateStr = String(tx["Date versée"] || "").trim();
    const txYear = getFiscalYear(txDateStr);
    const txQuarter = getQuarterNumber(txDateStr);

    if (txYear !== selectedYear || (txQuarter === null || !selectedQuarters.includes(txQuarter))) {
      return; // Skip transaction outside selected period
    }

    const acc = String(tx["Poste budgétaire"] || "").trim();

    // The reference can be in "No référence" (typically 6-digit numeric) or "Nom" (e.g. RIXXXXXX)
    const refNo = cleanRef(tx["No référence"]);
    const refNom = cleanRef(tx["Nom"]); // Originally removed, but might contain RIXXXXXX in real usage

    // Choose reference key: Prefer RI code in Nom, fallback to No référence
    let refKey = refNo;
    if (refNom.startsWith("RI")) {
      refKey = refNom;
    }

    if (!refKey) return; // Ignore ledger items without reference keys

    const key = `${acc}||${refKey}`;

    if (!ledgerGroups[key]) {
      ledgerGroups[key] = {
        account_code: acc,
        reference: refKey,
        montant_somme: 0.0,
        txs: []
      };
    }

    ledgerGroups[key].montant_somme += parseFloat(tx["Montant courant"]) || 0;
    ledgerGroups[key].txs.push(tx);
  });

  // Set tracking variable to see which ledger groups have been matched
  const matchedKeys = new Set();

  // 2. Loop through all activities in app database
  activities.forEach(act => {
    if (act.deleted) return;
    if (act.name.trim() === "") return; // Skip blank activities

    // Period filter
    const actYear = getFiscalYear(act.date_start);
    const actQuarter = getQuarterNumber(act.date_start);
    if (actYear !== selectedYear || (actQuarter === null || !selectedQuarters.includes(actQuarter))) {
      return; // Skip activity outside selected period
    }

    // Check reconciliation for each distribution (reference is now defined per account)
    act.distributions.forEach((dist: any, distIndex: number) => {
      const distRef = cleanRef(dist.reference);

      if (!distRef) {
        // Distribution without a reference: marked as "unlogged"
        results.push({
          activityId: act.id,
          activityName: act.name,
          distIndex,
          activity_date: act.date_start,
          account_code: dist.account_code,
          reference: "",
          amount_saisi: dist.amount,
          amount_gl: 0,
          status: "unlogged"
        });
        return;
      }

      // Find matching ledger group key
      const key = `${dist.account_code}||${distRef}`;
      const group = ledgerGroups[key];

      if (group) {
        matchedKeys.add(key);
        // Revenue in ledger is negative, so sum * -1 = positive revenue
        const expectedRevenue = group.montant_somme * -1;
        const diff = dist.amount - expectedRevenue;
        const isMatch = Math.abs(diff) < 0.02;

        results.push({
          activityId: act.id,
          activityName: act.name,
          distIndex,
          activity_date: act.date_start,
          account_code: dist.account_code,
          reference: distRef,
          amount_saisi: dist.amount,
          amount_gl: expectedRevenue,
          status: isMatch ? "valid" : "diff",
          diff: diff,
          ledgerTxs: group.txs
        });
      } else {
        // Logged in app, but not found in ledger
        results.push({
          activityId: act.id,
          activityName: act.name,
          distIndex,
          activity_date: act.date_start,
          account_code: dist.account_code,
          reference: distRef,
          amount_saisi: dist.amount,
          amount_gl: 0,
          status: "unlogged",
          diff: dist.amount
        });
      }
    });
  });

  // 3. Find ledger groups not matched to any activity distribution
  Object.keys(ledgerGroups).forEach(key => {
    if (!matchedKeys.has(key)) {
      const group = ledgerGroups[key];
      // Revenue is credit (negative in GL), multiply by -1
      const amountGl = group.montant_somme * -1;
      const txDates = group.txs.map((t: any) => String(t["Date versée"] || "").trim()).filter(Boolean);

      results.push({
        activityId: "",
        activityName: "(Non saisi dans l'application)",
        ledger_date: txDates.length ? txDates.sort()[0] : "",
        ledger_description: group.txs.map((t: any) => String(t["Description"] || t["Nom"] || "").trim()).find(Boolean) || "",
        account_code: group.account_code,
        reference: group.reference,
        amount_saisi: 0,
        amount_gl: amountGl,
        status: "unentered",
        diff: -amountGl,
        ledgerTxs: group.txs
      });
    }
  });

  attachFuzzyMatchSuggestions(results);

  return results;
}

// Fuzzy-matching thresholds for suggesting reconciliation candidates when no exact
// account+référence match is found (see attachFuzzyMatchSuggestions below)
const FUZZY_AMOUNT_TOLERANCE = 0.05;
const FUZZY_DATE_TOLERANCE_DAYS = 5;
const FUZZY_TEXT_MIN_SCORE = 0.3;

// Absolute day difference between two "YYYY-MM-DD" strings (Infinity if either is missing/invalid)
function daysBetweenDateStrs(dateStrA: string, dateStrB: string) {
  if (!dateStrA || !dateStrB) return Infinity;
  const a = parseLocalDateStr(dateStrA);
  const b = parseLocalDateStr(dateStrB);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return Infinity;
  return Math.abs((a.getTime() - b.getTime()) / 86400000);
}

// For every "unlogged" (saisi dans l'app, absent du GL) result, looks for "unentered" (présent
// dans le GL, absent de l'app) candidates on the same compte that could be the same transaction
// under a different référence — either because the amount and date are close, or because the
// activité name and GL description read alike (typo, date decalée). Attaches up to 3 ranked
// suggestions as result.suggestions; each unentered candidate keeps a back-reference to any
// unlogged result that suggested it, for symmetry in the UI.
function attachFuzzyMatchSuggestions(results: any[]) {
  const unlogged = results.filter(r => r.status === "unlogged");
  const unentered = results.filter(r => r.status === "unentered");
  if (unlogged.length === 0 || unentered.length === 0) return;

  unlogged.forEach(u => {
    const candidates: { entry: any; score: number; amountClose: boolean; dateClose: boolean; textScore: number }[] = unentered
      .filter((e: any) => e.account_code === u.account_code)
      .map((e: any) => {
        const amountClose = Math.abs((u.amount_saisi || 0) - (e.amount_gl || 0)) <= FUZZY_AMOUNT_TOLERANCE;
        const dateClose = daysBetweenDateStrs(u.activity_date, e.ledger_date) <= FUZZY_DATE_TOLERANCE_DAYS;
        const textScore = textSimilarity(u.activityName, e.ledger_description);
        if (!((amountClose && dateClose) || textScore >= FUZZY_TEXT_MIN_SCORE)) return null;
        // Simple combined score: amount+date match counts as much as a strong text match
        const score = (amountClose && dateClose ? 0.6 : 0) + textScore * 0.4;
        return { entry: e, score, amountClose, dateClose, textScore };
      })
      .filter((c): c is { entry: any; score: number; amountClose: boolean; dateClose: boolean; textScore: number } => c !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (candidates.length === 0) return;
    u.suggestions = candidates.map(c => ({
      reference: c.entry.reference,
      amount_gl: c.entry.amount_gl,
      ledger_date: c.entry.ledger_date,
      ledger_description: c.entry.ledger_description,
      score: c.score
    }));
    candidates.forEach(c => {
      if (!c.entry.suggestedFor) c.entry.suggestedFor = [];
      c.entry.suggestedFor.push(u.activityName);
    });
  });
}

function reconcileLedger() {
  reconciliationState.results = matchDistributionsToLedger(
    appState.activities,
    reconciliationState.ledgerTransactions,
    appState.selected_year,
    appState.selected_quarters
  );

  // Attach any previously-saved manual decision (validated/ignored) to each result, keyed the
  // same way as the ledger grouping ("account_code||reference"), so it persists across imports.
  reconciliationState.results.forEach(r => {
    r.reviewKey = r.reference ? `${r.account_code}||${r.reference}` : "";
    const decision = r.reviewKey ? reconciliationState.decisions[r.reviewKey] : null;
    r.reviewStatus = decision ? decision.status : "";
  });
}

export {
  reconciliationState,
  loadReconDecisions,
  setReconDecision,
  cleanRef,
  validateLedgerStructure,
  findBestColumnMatch,
  matchDistributionsToLedger,
  daysBetweenDateStrs,
  attachFuzzyMatchSuggestions,
  reconcileLedger
};

if (typeof window !== "undefined") {
  window.reconciliationState = reconciliationState;
  window.loadReconDecisions = loadReconDecisions;
  window.setReconDecision = setReconDecision;
  window.cleanRef = cleanRef;
  window.validateLedgerStructure = validateLedgerStructure;
  window.findBestColumnMatch = findBestColumnMatch;
  window.matchDistributionsToLedger = matchDistributionsToLedger;
  window.daysBetweenDateStrs = daysBetweenDateStrs;
  window.attachFuzzyMatchSuggestions = attachFuzzyMatchSuggestions;
  window.reconcileLedger = reconcileLedger;
}
