/**
 * reconciliation.js - Ledger import and the reconciliation ("Rapprochement
 * Comptable") engine and view
 */
import { validateRules } from "./validation.ts";
import { logError } from "./logger.ts";
import { tokenizeForMatch, textSimilarity } from "./fuzzy-match.ts";

// Reconciliation view/engine state, grouped so ledger data and UI state live together
let reconciliationState = {
  ledgerTransactions: [],
  results: [],
  filter: "all",
  page: 1,
  pageSize: 10,
  // Manually-reviewed lines, keyed by "account_code||reference" (see getReconDecisionsFromDb),
  // so decisions survive from one GL import to the next.
  decisions: {}
};

// Loads previously-saved reconciliation decisions from IndexedDB into reconciliationState.decisions.
// Called once on startup; safe to call again (e.g. after a decision changes) to stay in sync.
async function loadReconDecisions() {
  try {
    const list = await getReconDecisionsFromDb();
    reconciliationState.decisions = {};
    list.forEach(d => {
      reconciliationState.decisions[d.key] = d;
    });
  } catch (e) {
    logError("reconciliation", "chargement des décisions de rapprochement", e);
  }
}

// Marks (or clears, when status is "") a reconciliation line as manually validated/ignored.
async function setReconDecision(key, status, note = "") {
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
  reconcileLedger();
  renderReconciliationTable();
}

function initReconciliationHandlers() {
  loadReconDecisions();

  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("ledger-file-input");

  // Click dropzone triggers file picker
  dropZone.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", e => {
    const file = e.target.files[0];
    if (file) handleLedgerFile(file);
  });

  // Drag & drop events
  dropZone.addEventListener("dragover", e => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
  });

  dropZone.addEventListener("drop", e => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (file) handleLedgerFile(file);
  });

  // Clear file import
  document.getElementById("clear-ledger-btn").addEventListener("click", () => {
    reconciliationState.ledgerTransactions = [];
    reconciliationState.results = [];
    document.getElementById("reconciliation-panel").style.display = "none";
    document.getElementById("drop-zone").style.display = "flex";
    document.getElementById("ledger-file-input").value = "";
  });

  // Recon filter tabs
  document.querySelectorAll(".reconcile-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".reconcile-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      reconciliationState.filter = tab.getAttribute("data-recon-filter");
      reconciliationState.page = 1;
      renderReconciliationTable();
    });
  });

  // Close details modal
  document.getElementById("recon-detail-modal-close").addEventListener("click", closeReconDetailModal);
  document.getElementById("recon-detail-modal-close-btn").addEventListener("click", closeReconDetailModal);
  document.getElementById("modal-backdrop").addEventListener("click", () => {
    closeReconDetailModal();
    closeLedgerMappingModal();
  });

  // Close mapping modal
  const mapClose = document.getElementById("ledger-mapping-modal-close");
  if (mapClose) mapClose.addEventListener("click", closeLedgerMappingModal);

  const mapCancel = document.getElementById("ledger-mapping-modal-cancel");
  if (mapCancel) mapCancel.addEventListener("click", closeLedgerMappingModal);

  const mappingForm = document.getElementById("ledger-mapping-form");
  if (mappingForm) {
    mappingForm.addEventListener("submit", e => {
      e.preventDefault();
      applyColumnMappingAndImport();
    });
  }

  // Export the reconciliation table to Excel
  document.getElementById("export-reconciliation-btn").addEventListener("click", exportReconciliationToExcel);
}

// Status label used both on-screen (badgeHtml) and in the Excel export
const RECON_STATUS_LABELS = {
  valid: "Conforme",
  diff: "Écart de montant",
  unlogged: "Manquant dans le GL",
  unentered: "Manquant dans l'App"
};

// Exports the current reconciliation results (all statuses, ignoring the active tab filter) to
// an Excel workbook: one row per line with its account, activité, montants, écart and statut.
function exportReconciliationToExcel() {
  if (reconciliationState.results.length === 0) {
    showToast("Aucun rapprochement à exporter. Importez d'abord un fichier du Grand Livre.", "warning");
    return;
  }

  showLoadingOverlay("Génération de l'export du rapprochement...");
  // Deferred so the overlay actually paints before this synchronous work blocks the main thread.
  setTimeout(runReconciliationExcelExport, 20);
}

function runReconciliationExcelExport() {
  try {
    const header = [
      "Compte",
      "Description du compte",
      "Activité",
      "Référence",
      "Montant saisi",
      "Montant GL",
      "Écart",
      "Statut",
      "Décision manuelle"
    ];
    const reviewLabels = { validated: "Validé manuellement", ignored: "Ignoré" };
    const rows = reconciliationState.results.map(r => {
      const accountDesc = appState.settings.accounts.find(a => a.code === r.account_code)?.description || "Inconnu";
      const activityLabel = r.activityId ? `${r.activityId} : ${r.activityName}` : r.activityName;
      const diff = r.status === "unlogged" ? r.amount_saisi : r.status === "unentered" ? -r.amount_gl : r.diff || 0;
      return [
        r.account_code,
        accountDesc,
        activityLabel,
        r.reference || "",
        r.amount_saisi,
        r.amount_gl,
        diff,
        RECON_STATUS_LABELS[r.status] || r.status,
        reviewLabels[r.reviewStatus] || ""
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws["!cols"] = [{ wch: 18 }, { wch: 20 }, { wch: 35 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 20 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "RAPPROCHEMENT");

    const qStr = appState.selected_quarters
      .sort()
      .map(q => `T${q}`)
      .join("-");
    const filename = `rapprochement_${appState.selected_year}_${qStr || "aucun"}_${new Date().toISOString().split("T")[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
    showToast("Export du rapprochement terminé.", "success");
  } catch (err) {
    logError("reconciliation", "export du rapprochement", err);
    showToast("Erreur lors de l'export du rapprochement : " + err.message, "error");
  } finally {
    hideLoadingOverlay();
  }
}

function validateLedgerStructure(rawRows) {
  const firstRow = Array.isArray(rawRows) && rawRows.length > 0 ? rawRows[0] : null;
  const requiredColumns = ["Poste budgétaire", "Date versée", "Montant courant"];
  const missingColumns = firstRow ? requiredColumns.filter(col => !(col in firstRow)) : [];

  return validateRules([
    [!!firstRow, "Le fichier Excel est vide ou ne contient aucune ligne de données."],
    [
      missingColumns.length === 0,
      `Colonnes obligatoires manquantes dans le fichier Excel : ${missingColumns.join(", ")}. Veuillez vérifier que le fichier provient bien du Grand Livre.`
    ]
  ]);
}

let pendingLedgerRows = [];

function findBestColumnMatch(headers, possibleNames) {
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

function openLedgerMappingModal(headers) {
  const modal = document.getElementById("ledger-mapping-modal");
  const backdrop = document.getElementById("modal-backdrop");
  if (!modal || !backdrop) return;

  const selectIds = [
    { id: "map-poste-budgetaire", required: true, names: ["poste", "compte", "gl", "budget", "account"] },
    { id: "map-date-versee", required: true, names: ["date versée", "date versee", "date", "versement", "transaction"] },
    { id: "map-montant-courant", required: true, names: ["montant courant", "montant", "courant", "valeur", "amount", "solde"] },
    { id: "map-no-reference", required: false, names: ["référence", "reference", "ref", "numéro de référence", "no reference", "no doc"] },
    { id: "map-nom", required: false, names: ["nom", "auxiliaire", "client", "fournisseur", "name"] },
    { id: "map-description", required: false, names: ["description", "libellé", "libelle", "details", "détails", "memo", "texte"] }
  ];

  let savedMapping = null;
  try {
    const raw = localStorage.getItem("outil_marie_ledger_col_mapping");
    if (raw) savedMapping = JSON.parse(raw);
  } catch (e) {
    logError("reconciliation", "lecture du mapping de colonnes sauvegardé", e);
  }

  selectIds.forEach(selectConfig => {
    const select = document.getElementById(selectConfig.id);
    if (!select) return;
    select.innerHTML = selectConfig.required ? "" : '<option value="">(Non associé)</option>';

    headers.forEach(h => {
      const opt = document.createElement("option");
      opt.value = h;
      opt.textContent = h;
      select.appendChild(opt);
    });

    // Heuristics or saved mapping
    if (savedMapping && savedMapping[selectConfig.id] && headers.includes(savedMapping[selectConfig.id])) {
      select.value = savedMapping[selectConfig.id];
    } else {
      const matched = findBestColumnMatch(headers, selectConfig.names);
      if (matched) {
        select.value = matched;
      } else if (!selectConfig.required) {
        select.value = "";
      }
    }
  });

  modal.classList.add("active");
  backdrop.classList.add("active");
}

function closeLedgerMappingModal() {
  const modal = document.getElementById("ledger-mapping-modal");
  const backdrop = document.getElementById("modal-backdrop");
  if (modal) modal.classList.remove("active");
  if (backdrop) backdrop.classList.remove("active");
  pendingLedgerRows = [];
  document.getElementById("ledger-file-input").value = "";
}

function applyColumnMappingAndImport() {
  const posteKey = document.getElementById("map-poste-budgetaire").value;
  const dateKey = document.getElementById("map-date-versee").value;
  const montantKey = document.getElementById("map-montant-courant").value;
  const refKey = document.getElementById("map-no-reference").value;
  const nomKey = document.getElementById("map-nom").value;
  const descKey = document.getElementById("map-description").value;

  if (posteKey === dateKey || posteKey === montantKey || dateKey === montantKey) {
    showToast("Veuillez sélectionner des colonnes distinctes pour les champs obligatoires.", "warning");
    return;
  }

  // Save to localStorage
  const mapping = {
    "map-poste-budgetaire": posteKey,
    "map-date-versee": dateKey,
    "map-montant-courant": montantKey,
    "map-no-reference": refKey,
    "map-nom": nomKey,
    "map-description": descKey
  };
  try {
    localStorage.setItem("outil_marie_ledger_col_mapping", JSON.stringify(mapping));
  } catch (e) {
    logError("reconciliation", "sauvegarde du mapping de colonnes", e);
  }

  // Map pending ledger rows to target shape
  const mappedTransactions = pendingLedgerRows.map(row => {
    const mapped = {};
    mapped["Poste budgétaire"] = String(row[posteKey] || "").trim();
    mapped["Date versée"] = String(row[dateKey] || "").trim();
    mapped["Montant courant"] = parseFloat(row[montantKey]) || 0.0;
    mapped["No référence"] = refKey ? String(row[refKey] || "").trim() : "";
    mapped["Nom"] = nomKey ? String(row[nomKey] || "").trim() : "";
    mapped["Description"] = descKey ? String(row[descKey] || "").trim() : "";
    mapped["Auxiliaire"] = nomKey ? String(row[nomKey] || "").trim() : "";
    mapped["Tr. type"] = String(row["Tr. type"] || "").trim();
    mapped["No doc. GL"] = String(row["No doc. GL"] || "").trim();
    return mapped;
  });

  reconciliationState.ledgerTransactions = mappedTransactions.filter(row => {
    const poste = row["Poste budgétaire"];
    const dateVersee = row["Date versée"];
    const montant = row["Montant courant"];

    return (
      poste !== "" && poste !== "Total" && dateVersee !== "" && dateVersee !== "Total" && dateVersee !== "Grand Total" && !isNaN(montant)
    );
  });

  if (reconciliationState.ledgerTransactions.length === 0) {
    showToast("Aucune transaction valide n'a été trouvée après application du mappage.", "warning");
    closeLedgerMappingModal();
    return;
  }

  // Perform reconciliation and close modal
  reconcileLedger();

  document.getElementById("drop-zone").style.display = "none";
  document.getElementById("reconciliation-panel").style.display = "grid";

  renderReconciliation();

  // Close modal
  const modal = document.getElementById("ledger-mapping-modal");
  const backdrop = document.getElementById("modal-backdrop");
  if (modal) modal.classList.remove("active");
  if (backdrop) backdrop.classList.remove("active");
  showToast("Importation réussie avec mappage de colonnes.", "success");
}

// Read ledger spreadsheet via SheetJS
function handleLedgerFile(file) {
  const reader = new FileReader();
  showLoadingOverlay("Lecture du fichier du Grand Livre...");

  reader.onerror = function () {
    hideLoadingOverlay();
    logError("reconciliation", "lecture du fichier grand livre", reader.error);
    showToast("Erreur lors de la lecture du fichier.", "error");
  };

  reader.onload = function (e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheet = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheet];
      const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

      if (!Array.isArray(rawRows) || rawRows.length === 0) {
        showToast("Échec de l'importation : Le fichier Excel est vide ou invalide.", "error");
        return;
      }

      const validation = validateLedgerStructure(rawRows);
      if (!validation.valid) {
        // If not valid, prompt for column mapping
        pendingLedgerRows = rawRows;
        openLedgerMappingModal(Object.keys(rawRows[0]));
        return;
      }

      // Map columns based on French ledger format
      // Standard headers: Poste budgétaire, Description, Période, Date versée, Tr. type, Nom, No référence, Montant courant, etc.
      // Clean and validate rows: must be actual ledger entries
      reconciliationState.ledgerTransactions = rawRows.filter(row => {
        const poste = String(row["Poste budgétaire"] || "").trim();
        const dateVersee = String(row["Date versée"] || "").trim();
        const montant = parseFloat(row["Montant courant"]);

        return (
          poste !== "" &&
          poste !== "Total" &&
          dateVersee !== "" &&
          dateVersee !== "Total" &&
          dateVersee !== "Grand Total" &&
          !isNaN(montant)
        );
      });

      if (reconciliationState.ledgerTransactions.length === 0) {
        showToast("Aucune transaction valide n'a été trouvée dans le fichier. Veuillez vérifier la structure du fichier Excel.", "warning");
        return;
      }

      // Perform reconciliation
      reconcileLedger();

      // Show results panels
      document.getElementById("drop-zone").style.display = "none";
      document.getElementById("reconciliation-panel").style.display = "grid";

      renderReconciliation();
    } catch (err) {
      logError("reconciliation", "lecture du fichier grand livre", err);
      showToast("Erreur lors de la lecture du fichier : " + err.message, "error");
    } finally {
      hideLoadingOverlay();
    }
  };

  reader.readAsArrayBuffer(file);
}

// Format reference key: uppercased, trimmed, and stripped of the trailing ".0" Excel adds when
// a numeric reference column is read as a float.
function cleanRef(val) {
  if (val === undefined || val === null) return "";
  let s = String(val).trim().toUpperCase();
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  return s;
}

// Reconciliation Engine Algorithm (pure: no DOM, no globals besides its arguments) — matches
// each activity distribution against the imported GL ledger for the selected fiscal
// year/quarters. Kept separate from reconcileLedger() so it can be unit tested directly.
function matchDistributionsToLedger(activities, ledgerTransactions, selectedYear, selectedQuarters) {
  const results = [];

  // 1. Group ledger transactions by Account & Clean Reference
  const ledgerGroups = {};

  ledgerTransactions.forEach(tx => {
    // Period filter: Check transaction date against selected year and quarters
    const txDateStr = String(tx["Date versée"] || "").trim();
    const txYear = getFiscalYear(txDateStr);
    const txQuarter = getQuarterNumber(txDateStr);

    if (txYear !== selectedYear || !selectedQuarters.includes(txQuarter)) {
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
    if (actYear !== selectedYear || !selectedQuarters.includes(actQuarter)) {
      return; // Skip activity outside selected period
    }

    // Check reconciliation for each distribution (reference is now defined per account)
    act.distributions.forEach((dist, distIndex) => {
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
      const txDates = group.txs.map(t => String(t["Date versée"] || "").trim()).filter(Boolean);

      results.push({
        activityId: "",
        activityName: "(Non saisi dans l'application)",
        ledger_date: txDates.length ? txDates.sort()[0] : "",
        ledger_description: group.txs.map(t => String(t["Description"] || t["Nom"] || "").trim()).find(Boolean) || "",
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
function daysBetweenDateStrs(dateStrA, dateStrB) {
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
function attachFuzzyMatchSuggestions(results) {
  const unlogged = results.filter(r => r.status === "unlogged");
  const unentered = results.filter(r => r.status === "unentered");
  if (unlogged.length === 0 || unentered.length === 0) return;

  unlogged.forEach(u => {
    const candidates = unentered
      .filter(e => e.account_code === u.account_code)
      .map(e => {
        const amountClose = Math.abs((u.amount_saisi || 0) - (e.amount_gl || 0)) <= FUZZY_AMOUNT_TOLERANCE;
        const dateClose = daysBetweenDateStrs(u.activity_date, e.ledger_date) <= FUZZY_DATE_TOLERANCE_DAYS;
        const textScore = textSimilarity(u.activityName, e.ledger_description);
        if (!((amountClose && dateClose) || textScore >= FUZZY_TEXT_MIN_SCORE)) return null;
        // Simple combined score: amount+date match counts as much as a strong text match
        const score = (amountClose && dateClose ? 0.6 : 0) + textScore * 0.4;
        return { entry: e, score, amountClose, dateClose, textScore };
      })
      .filter(Boolean)
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

function renderReconciliation() {
  if (reconciliationState.results.length === 0) return;

  // Count stats
  const valid = reconciliationState.results.filter(r => r.status === "valid").length;
  const diff = reconciliationState.results.filter(r => r.status === "diff").length;
  const unlogged = reconciliationState.results.filter(r => r.status === "unlogged").length;
  const unentered = reconciliationState.results.filter(r => r.status === "unentered").length;

  document.getElementById("recon-stat-valid").textContent = valid;
  document.getElementById("recon-stat-diff").textContent = diff;
  document.getElementById("recon-stat-unlogged").textContent = unlogged;
  document.getElementById("recon-stat-unentered").textContent = unentered;

  document.getElementById("count-recon-all").textContent = reconciliationState.results.length;
  document.getElementById("count-recon-valid").textContent = valid;
  document.getElementById("count-recon-diff").textContent = diff;
  document.getElementById("count-recon-unlogged").textContent = unlogged;
  document.getElementById("count-recon-unentered").textContent = unentered;

  renderReconciliationTable();
}

function renderReconciliationTable() {
  saveUiState();
  const tbody = document.getElementById("reconciliation-table-body");
  tbody.innerHTML = "";

  const filtered = reconciliationState.results.filter(r => {
    if (reconciliationState.filter === "all") return true;
    return r.status === reconciliationState.filter;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="color: var(--text-muted); padding: 32px;">Aucun enregistrement dans cette catégorie.</td></tr>`;
    renderPaginationBar(document.getElementById("reconciliation-pagination"), {
      page: reconciliationState.page,
      pageSize: reconciliationState.pageSize,
      totalItems: 0,
      onPageChange: () => {},
      onPageSizeChange: () => {}
    });
    return;
  }

  reconciliationState.page = renderPaginationBar(document.getElementById("reconciliation-pagination"), {
    page: reconciliationState.page,
    pageSize: reconciliationState.pageSize,
    totalItems: filtered.length,
    onPageChange: p => {
      reconciliationState.page = p;
      renderReconciliationTable();
    },
    onPageSizeChange: s => {
      reconciliationState.pageSize = s;
      reconciliationState.page = 1;
      renderReconciliationTable();
    }
  });
  const startIdx = (reconciliationState.page - 1) * reconciliationState.pageSize;
  const pageItems = filtered.slice(startIdx, startIdx + reconciliationState.pageSize);

  pageItems.forEach((r, localIdx) => {
    const idx = startIdx + localIdx;
    // Badges definitions
    const badgeHtml = {
      valid: `<span class="badge badge-success">Conforme</span>`,
      diff: `<span class="badge badge-danger">Écart de montant</span>`,
      unlogged: `<span class="badge badge-warning">Manquant dans le GL</span>`,
      unentered: `<span class="badge badge-info">Manquant dans l'App</span>`
    }[r.status];

    // Diff column text
    let diffText = "-";
    if (r.status === "diff") {
      const sign = r.diff > 0 ? "+" : "";
      diffText = `<span class="text-danger bold">${sign}${formatCurrency(r.diff)}</span>`;
    } else if (r.status === "unlogged") {
      diffText = `<span class="text-warning bold">+${formatCurrency(r.amount_saisi)}</span>`;
    } else if (r.status === "unentered") {
      diffText = `<span class="text-info bold">-${formatCurrency(r.amount_gl)}</span>`;
    }

    // Action buttons based on status
    let actionBtn = "";
    if (r.status === "unentered") {
      // Ledger row has transaction but missing in application. Provide "+" button to quickly log it
      actionBtn = `
        <button class="btn btn-secondary quick-add-ledger-btn" data-idx="${idx}" style="padding: 6px 12px; font-size: 0.8rem;" title="Enregistrer l'activité">
          + Créer activité
        </button>
      `;
    } else if (r.ledgerTxs && r.ledgerTxs.length > 0) {
      // Provide Details magnifying glass button to see lines
      actionBtn = `
        <button class="btn btn-secondary view-recon-lines-btn" data-idx="${idx}" style="padding: 6px 12px; font-size: 0.8rem;">
          Détails GL
        </button>
      `;
    }

    // Manual review controls: only meaningful for non-conforme lines that carry a stable
    // reviewKey (rows without a référence can't be tracked across imports).
    let reviewHtml = "";
    if (r.status !== "valid" && r.reviewKey) {
      if (r.reviewStatus === "validated") {
        reviewHtml = `
          <div class="recon-review-note text-success" style="font-size: 0.75rem; margin-top: 6px;">
            ✓ Validé manuellement
            <button class="btn-icon recon-clear-review-btn" data-review-key="${r.reviewKey}" title="Annuler la validation" style="width: 18px; height: 18px;">&times;</button>
          </div>
        `;
      } else if (r.reviewStatus === "ignored") {
        reviewHtml = `
          <div class="recon-review-note text-muted" style="font-size: 0.75rem; margin-top: 6px;">
            Ignoré
            <button class="btn-icon recon-clear-review-btn" data-review-key="${r.reviewKey}" title="Annuler" style="width: 18px; height: 18px;">&times;</button>
          </div>
        `;
      } else {
        reviewHtml = `
          <div style="display: flex; gap: 4px; margin-top: 6px; justify-content: flex-end;">
            <button class="btn btn-secondary recon-validate-btn" data-review-key="${r.reviewKey}" style="padding: 4px 8px; font-size: 0.72rem;" title="Marquer cet écart comme vérifié manuellement">
              Valider
            </button>
            <button class="btn btn-secondary recon-ignore-btn" data-review-key="${r.reviewKey}" style="padding: 4px 8px; font-size: 0.72rem;" title="Ignorer cet écart">
              Ignorer
            </button>
          </div>
        `;
      }
    }

    // Fuzzy-match suggestions (only when no exact match was found): "unlogged" lines get an
    // actionable button to fix the reference; "unentered" lines just show which activités they
    // resemble (the fix always happens from the "unlogged" side).
    let suggestionsHtml = "";
    if (r.status === "unlogged" && r.suggestions && r.suggestions.length > 0) {
      suggestionsHtml = `
        <div style="margin-top: 6px; font-size: 0.75rem; color: var(--text-secondary);">
          <div style="font-style: italic; margin-bottom: 2px;">Suggestions de rapprochement :</div>
          ${r.suggestions
            .map(
              s => `
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
              <span class="font-mono">${escapeHtml(s.reference)}</span> — ${formatCurrency(s.amount_gl)} (${s.ledger_date || "date inconnue"})
              <button class="btn-icon recon-accept-suggestion-btn" data-idx="${idx}" data-suggestion-ref="${escapeHtml(s.reference)}" title="Corriger la référence de cette activité">
                <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: var(--success);"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              </button>
            </div>
          `
            )
            .join("")}
        </div>
      `;
    } else if (r.status === "unentered" && r.suggestedFor && r.suggestedFor.length > 0) {
      suggestionsHtml = `
        <div style="margin-top: 6px; font-size: 0.75rem; font-style: italic; color: var(--text-secondary);">
          Ressemble à : ${escapeHtml(r.suggestedFor.join(", "))}
        </div>
      `;
    }

    const accountDesc = appState.settings.accounts.find(a => a.code === r.account_code)?.description || "Inconnu";
    const rowMuted = r.reviewStatus ? ' style="opacity: 0.65;"' : "";

    tbody.innerHTML += `
      <tr${rowMuted}>
        <td>
          <div class="bold font-mono">${r.account_code}</div>
          <div style="font-size: 0.8rem; color: var(--text-secondary);">${escapeHtml(accountDesc)}</div>
          <div style="font-size: 0.78rem; font-style: italic; color: var(--text-muted); margin-top: 4px;">
            ${r.activityId ? `${r.activityId} : ${escapeHtml(r.activityName)}` : escapeHtml(r.activityName)}
          </div>
          ${suggestionsHtml}
        </td>
        <td class="font-mono">${escapeHtml(r.reference) || "-"}</td>
        <td class="bold">${r.amount_saisi > 0 ? formatCurrency(r.amount_saisi) : "-"}</td>
        <td class="bold">${r.amount_gl > 0 ? formatCurrency(r.amount_gl) : "-"}</td>
        <td>${diffText}</td>
        <td>${badgeHtml}</td>
        <td class="text-right">
          ${actionBtn}
          ${reviewHtml}
        </td>
      </tr>
    `;
  });

  // Attach quick add buttons
  document.querySelectorAll(".quick-add-ledger-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const matchIdx = parseInt(btn.getAttribute("data-idx"));
      const r = filtered[matchIdx];

      // Create a new activity pre-filled from this unlogged GL transaction and open its record
      const id = createActivity(`Ajustement GL - Réf ${r.reference}`);
      renderActivities();
      openActivityDrawer(id);

      // Clear the blank default distribution row and write this one, on the Facturation tab
      document.getElementById("form-distribution-list").innerHTML = "";
      addDistributionRow(r.account_code, r.amount_gl, r.reference);
      switchActivityTab("billing");
    });
  });

  // Attach details lines viewer buttons
  document.querySelectorAll(".view-recon-lines-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const matchIdx = parseInt(btn.getAttribute("data-idx"));
      const r = filtered[matchIdx];
      openReconDetailModal(r);
    });
  });

  // Attach manual review controls (validate / ignore / cancel)
  document.querySelectorAll(".recon-validate-btn").forEach(btn => {
    btn.addEventListener("click", () => setReconDecision(btn.getAttribute("data-review-key"), "validated"));
  });
  document.querySelectorAll(".recon-ignore-btn").forEach(btn => {
    btn.addEventListener("click", () => setReconDecision(btn.getAttribute("data-review-key"), "ignored"));
  });
  document.querySelectorAll(".recon-clear-review-btn").forEach(btn => {
    btn.addEventListener("click", () => setReconDecision(btn.getAttribute("data-review-key"), ""));
  });

  // Attach "accepter la suggestion" buttons: patches the activity's distribution reference to
  // match the suggested GL référence, so the next reconciliation pass matches it exactly.
  document.querySelectorAll(".recon-accept-suggestion-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const matchIdx = parseInt(btn.getAttribute("data-idx"));
      const r = filtered[matchIdx];
      applyReconSuggestion(r, btn.getAttribute("data-suggestion-ref"));
    });
  });
}

// Fixes the référence of the activity distribution behind an "unlogged" result to match the
// accepted fuzzy-match suggestion, then re-runs reconciliation so it (hopefully) becomes conforme.
function applyReconSuggestion(result, newReference) {
  const act = appState.activities.find(a => a.id === result.activityId);
  if (!act || !act.distributions[result.distIndex]) return;
  act.distributions[result.distIndex].reference = newReference;
  saveDatabase();
  reconcileLedger();
  renderReconciliation();
  showToast(`Référence mise à jour pour « ${act.name} ».`, "success");
}

function openReconDetailModal(reconRecord) {
  const modal = document.getElementById("recon-detail-modal");
  const backdrop = document.getElementById("modal-backdrop");

  document.getElementById("recon-detail-account").textContent =
    `${reconRecord.account_code} (${appState.settings.accounts.find(a => a.code === reconRecord.account_code)?.description || "Inconnu"})`;
  document.getElementById("recon-detail-ref").textContent = reconRecord.reference;

  const tbody = document.getElementById("recon-detail-table-body");
  tbody.innerHTML = "";

  reconRecord.ledgerTxs.forEach(tx => {
    tbody.innerHTML += `
      <tr>
        <td class="font-mono" style="white-space: nowrap;">${escapeHtml(tx["Date versée"]) || "-"}</td>
        <td>${escapeHtml(tx["Auxiliaire"]) || "-"}</td>
        <td style="font-size: 0.82rem;">${escapeHtml(tx["Description"]) || "-"}</td>
        <td>${escapeHtml(tx["Tr. type"]) || "-"}</td>
        <td class="font-mono">${escapeHtml(tx["No doc. GL"]) || "-"}</td>
        <td class="text-right bold font-mono">${formatCurrency(parseFloat(tx["Montant courant"]))}</td>
      </tr>
    `;
  });

  modal.classList.add("active");
  backdrop.classList.add("active");
}

function closeReconDetailModal() {
  document.getElementById("recon-detail-modal").classList.remove("active");
  document.getElementById("modal-backdrop").classList.remove("active");
}

export {
  matchDistributionsToLedger,
  cleanRef,
  validateLedgerStructure,
  reconciliationState,
  loadReconDecisions,
  setReconDecision,
  initReconciliationHandlers,
  exportReconciliationToExcel,
  findBestColumnMatch,
  openLedgerMappingModal,
  closeLedgerMappingModal,
  applyColumnMappingAndImport,
  handleLedgerFile,
  daysBetweenDateStrs,
  tokenizeForMatch,
  textSimilarity,
  attachFuzzyMatchSuggestions,
  reconcileLedger,
  renderReconciliation,
  renderReconciliationTable,
  applyReconSuggestion,
  openReconDetailModal,
  closeReconDetailModal
};

if (typeof window !== "undefined") {
  window.matchDistributionsToLedger = matchDistributionsToLedger;
  window.cleanRef = cleanRef;
  window.validateLedgerStructure = validateLedgerStructure;
  window.reconciliationState = reconciliationState;
  window.loadReconDecisions = loadReconDecisions;
  window.setReconDecision = setReconDecision;
  window.initReconciliationHandlers = initReconciliationHandlers;
  window.exportReconciliationToExcel = exportReconciliationToExcel;
  window.findBestColumnMatch = findBestColumnMatch;
  window.openLedgerMappingModal = openLedgerMappingModal;
  window.closeLedgerMappingModal = closeLedgerMappingModal;
  window.applyColumnMappingAndImport = applyColumnMappingAndImport;
  window.handleLedgerFile = handleLedgerFile;
  window.daysBetweenDateStrs = daysBetweenDateStrs;
  window.tokenizeForMatch = tokenizeForMatch;
  window.textSimilarity = textSimilarity;
  window.attachFuzzyMatchSuggestions = attachFuzzyMatchSuggestions;
  window.reconcileLedger = reconcileLedger;
  window.renderReconciliation = renderReconciliation;
  window.renderReconciliationTable = renderReconciliationTable;
  window.applyReconSuggestion = applyReconSuggestion;
  window.openReconDetailModal = openReconDetailModal;
  window.closeReconDetailModal = closeReconDetailModal;
}
