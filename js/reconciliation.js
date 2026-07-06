/**
 * reconciliation.js - Ledger import and the reconciliation ("Rapprochement
 * Comptable") engine and view
 */

// Reconciliation view/engine state, grouped so ledger data and UI state live together
let reconciliationState = {
  ledgerTransactions: [],
  results: [],
  filter: "all",
  page: 1,
  pageSize: 10
};

function initReconciliationHandlers() {
  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("ledger-file-input");

  // Click dropzone triggers file picker
  dropZone.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) handleLedgerFile(file);
  });

  // Drag & drop events
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
  });

  dropZone.addEventListener("drop", (e) => {
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
  document.getElementById("modal-backdrop").addEventListener("click", closeReconDetailModal);
}

// Read ledger spreadsheet via SheetJS
function handleLedgerFile(file) {
  const reader = new FileReader();

  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheet];
      const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

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
        alert("Aucune transaction valide n'a été trouvée dans le fichier. Veuillez vérifier la structure du fichier Excel.");
        return;
      }

      // Perform reconciliation
      reconcileLedger();

      // Show results panels
      document.getElementById("drop-zone").style.display = "none";
      document.getElementById("reconciliation-panel").style.display = "grid";

      renderReconciliation();
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la lecture du fichier : " + err.message);
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
    if (act.name.trim() === "") return; // Skip blank activities

    // Period filter
    const actYear = getFiscalYear(act.date_start);
    const actQuarter = getQuarterNumber(act.date_start);
    if (actYear !== selectedYear || !selectedQuarters.includes(actQuarter)) {
      return; // Skip activity outside selected period
    }

    // Check reconciliation for each distribution (reference is now defined per account)
    act.distributions.forEach(dist => {
      const distRef = cleanRef(dist.reference);

      if (!distRef) {
        // Distribution without a reference: marked as "unlogged"
        results.push({
          activityId: act.id,
          activityName: act.name,
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

      results.push({
        activityId: "",
        activityName: "(Non saisi dans l'application)",
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

  return results;
}

function reconcileLedger() {
  reconciliationState.results = matchDistributionsToLedger(
    appState.activities,
    reconciliationState.ledgerTransactions,
    appState.selected_year,
    appState.selected_quarters
  );
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
    renderPaginationBar(document.getElementById("reconciliation-pagination"), { page: reconciliationState.page, pageSize: reconciliationState.pageSize, totalItems: 0, onPageChange: () => {}, onPageSizeChange: () => {} });
    return;
  }

  reconciliationState.page = renderPaginationBar(document.getElementById("reconciliation-pagination"), {
    page: reconciliationState.page,
    pageSize: reconciliationState.pageSize,
    totalItems: filtered.length,
    onPageChange: (p) => { reconciliationState.page = p; renderReconciliationTable(); },
    onPageSizeChange: (s) => { reconciliationState.pageSize = s; reconciliationState.page = 1; renderReconciliationTable(); }
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

    const accountDesc = appState.settings.accounts.find(a => a.code === r.account_code)?.description || "Inconnu";

    tbody.innerHTML += `
      <tr>
        <td>
          <div class="bold font-mono">${r.account_code}</div>
          <div style="font-size: 0.8rem; color: var(--text-secondary);">${accountDesc}</div>
          <div style="font-size: 0.78rem; font-style: italic; color: var(--text-muted); margin-top: 4px;">
            ${r.activityId ? `${r.activityId} : ${r.activityName}` : r.activityName}
          </div>
        </td>
        <td class="font-mono">${r.reference || '-'}</td>
        <td class="bold">${r.amount_saisi > 0 ? formatCurrency(r.amount_saisi) : '-'}</td>
        <td class="bold">${r.amount_gl > 0 ? formatCurrency(r.amount_gl) : '-'}</td>
        <td>${diffText}</td>
        <td>${badgeHtml}</td>
        <td class="text-right">${actionBtn}</td>
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
}

function openReconDetailModal(reconRecord) {
  const modal = document.getElementById("recon-detail-modal");
  const backdrop = document.getElementById("modal-backdrop");

  document.getElementById("recon-detail-account").textContent = `${reconRecord.account_code} (${appState.settings.accounts.find(a => a.code === reconRecord.account_code)?.description || 'Inconnu'})`;
  document.getElementById("recon-detail-ref").textContent = reconRecord.reference;

  const tbody = document.getElementById("recon-detail-table-body");
  tbody.innerHTML = "";

  reconRecord.ledgerTxs.forEach(tx => {
    tbody.innerHTML += `
      <tr>
        <td class="font-mono" style="white-space: nowrap;">${tx["Date versée"] || '-'}</td>
        <td>${tx["Auxiliaire"] || '-'}</td>
        <td style="font-size: 0.82rem;">${tx["Description"] || '-'}</td>
        <td>${tx["Tr. type"] || '-'}</td>
        <td class="font-mono">${tx["No doc. GL"] || '-'}</td>
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

// Exposed to Node's test runner (test/*.test.js); no-op in the browser, where `module` is undefined.
if (typeof module !== "undefined") {
  module.exports = { matchDistributionsToLedger, cleanRef };
}
